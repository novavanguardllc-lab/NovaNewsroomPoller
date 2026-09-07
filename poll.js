// poll.js — runs on a GitHub Actions cron instead of Firebase's
// onSchedule("every 5 minutes"). Reuses your real sources.js, similarity.js,
// and the corrected classify.js unchanged.
//
// ARCHITECTURE CHANGE FROM FIREBASE: quiet-hours logic and watchlist
// matching have both moved to the client (see mobile-patch/). This server
// script now pushes EVERY new item (any tier) to ntfy, with full metadata
// as a JSON payload — the phone decides locally whether to actually alert,
// based on its own quiet-hours state and its own locally-stored watchlist.
// That's what lets watchlist matching work with zero server-side sync: the
// server never needs to know what you're watching.

const fs = require("fs");
const crypto = require("crypto");
const Parser = require("rss-parser");

const sources = require("./sources");
const { findCorroboratingItems } = require("./similarity");
const { classifyTier, classifyTopic, WIRE_SOURCES } = require("./classify");

const STATE_PATH = "state.json";
const LATEST_PATH = "latest.json";
const RETENTION_DAYS = 7;
const CORROBORATION_WINDOW_MINUTES = 90; // must match similarity.js's own window
const LATEST_FEED_SIZE = 200;

const NTFY_SERVER = process.env.NTFY_SERVER || "https://ntfy.sh";
const NTFY_TOPIC = process.env.NTFY_TOPIC;

const parser = new Parser({ timeout: 10000 });

function loadState() {
  if (fs.existsSync(STATE_PATH)) {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  }
  return { items: [], sourceStatus: {} };
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function hashId(str) {
  return "story_" + crypto.createHash("sha1").update(str).digest("hex").slice(0, 16);
}

function extractImage(entry) {
  if (entry.enclosure?.url) return entry.enclosure.url;
  if (entry["media:content"]?.$?.url) return entry["media:content"].$.url;
  const match = (entry["content:encoded"] || entry.content || "").match(/<img[^>]+src="([^">]+)"/);
  return match ? match[1] : null;
}

async function pollSource(source, state, existingIds) {
  try {
    const feed = await parser.parseURL(source.url);
    state.sourceStatus[source.name] = { online: true, lastSuccess: new Date().toISOString() };

    const stored = [];
    for (const entry of feed.items || []) {
      const link = entry.link || entry.guid;
      if (!link) continue;
      const id = hashId(link);
      if (existingIds.has(id)) continue;
      existingIds.add(id);

      const item = {
        id,
        source: source.name,
        sourceColor: source.color,
        headline: entry.title || "(untitled)",
        snippet: (entry.contentSnippet || "").slice(0, 240),
        link,
        imageUrl: extractImage(entry),
        publishedAt: entry.isoDate || new Date().toISOString(),
        tier: "routine",
        topic: "news",
        corroboratedCount: 1,
      };
      state.items.push(item);
      stored.push(item);
    }
    return stored;
  } catch (err) {
    state.sourceStatus[source.name] = {
      online: false,
      lastError: err.message,
      lastErrorAt: new Date().toISOString(),
    };
    console.error(`Feed failed: ${source.name}`, err.message);
    return [];
  }
}

async function pushToNtfy(item) {
  if (!NTFY_TOPIC) {
    console.warn("NTFY_TOPIC not set, skipping push");
    return;
  }
  try {
    await fetch(`${NTFY_SERVER}/${NTFY_TOPIC}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Title": item.tier === "major" ? "Major breaking" : item.headline.slice(0, 60),
        "X-Priority": item.tier === "major" ? "5" : item.tier === "developing" ? "4" : "3",
      },
      // Full item as JSON — the client parses the ntfy "message" field as
      // JSON to reconstruct it, rather than just showing raw text.
      body: JSON.stringify(item),
    });
  } catch (err) {
    console.error("ntfy push failed:", err.message);
  }
}

async function main() {
  const state = loadState();
  const now = new Date();
  const existingIds = new Set(state.items.map((i) => i.id));

  const results = await Promise.allSettled(sources.map((s) => pollSource(s, state, existingIds)));
  const newlyStoredItems = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

  const windowStart = now.getTime() - CORROBORATION_WINDOW_MINUTES * 60 * 1000;
  const recentItems = state.items.filter((i) => new Date(i.publishedAt).getTime() >= windowStart);

  for (const item of newlyStoredItems) {
    const others = recentItems.filter((r) => r.id !== item.id);
    const matches = findCorroboratingItems(item, others);
    const corroboratedCount = matches.length + 1;
    const isWireSource = WIRE_SOURCES.includes(item.source);

    item.corroboratedCount = corroboratedCount;
    item.topic = classifyTopic(item.headline);
    item.tier = classifyTier({ item, corroboratedCount, matchingItems: matches, isWireSource });
  }

  // Retention — mirrors the old daily cleanupOldStories function, just
  // folded into every run since state.json is small and this is cheap.
  const cutoff = now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  state.items = state.items.filter((i) => new Date(i.publishedAt).getTime() >= cutoff);

  saveState(state);

  fs.writeFileSync(
    LATEST_PATH,
    JSON.stringify(
      {
        updatedAt: now.toISOString(),
        sourceStatus: state.sourceStatus,
        items: state.items.slice(-LATEST_FEED_SIZE),
      },
      null,
      2
    )
  );

  for (const item of newlyStoredItems) {
    await pushToNtfy(item);
  }

  console.log(`Poll complete: ${newlyStoredItems.length} new item(s), ${state.items.length} total in state.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
