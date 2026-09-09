// api/poll.js — Vercel serverless function, triggered by an external
// cron service (cron-job.org) instead of GitHub Actions' own scheduler.
// Same fetch/corroborate/classify logic as the original poll.js, but
// storage moves from local file writes + git commit to the GitHub
// Contents API, since a serverless function has no persistent disk
// between invocations.

const crypto = require("crypto");
const Parser = require("rss-parser");

const sources = require("../sources");
const { findCorroboratingItems } = require("../similarity");
const { classifyTier, classifyTopic, WIRE_SOURCES } = require("../classify");

const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // fine-grained PAT, Contents: read+write, scoped to this one repo
const GITHUB_REPO = process.env.GITHUB_REPO; // e.g. "novavanguardllc-lab/novanewsroompoller"
const NTFY_SERVER = process.env.NTFY_SERVER || "https://ntfy.sh";
const NTFY_TOPIC = process.env.NTFY_TOPIC;
const POLL_SECRET = process.env.POLL_SECRET; // shared secret — without this, anyone who finds this URL could trigger it repeatedly

const RETENTION_DAYS = 7;
const CORROBORATION_WINDOW_MINUTES = 90;
const LATEST_FEED_SIZE = 200;

const parser = new Parser({ timeout: 10000 });

async function githubGetFile(path) {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`, {
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json" },
  });
  if (res.status === 404) return { content: null, sha: null };
  if (!res.ok) throw new Error(`GitHub GET ${path} failed: ${res.status}`);
  const data = await res.json();
  const content = JSON.parse(Buffer.from(data.content, "base64").toString("utf8"));
  return { content, sha: data.sha };
}

async function githubPutFile(path, content, sha) {
  const body = {
    message: `poll: ${new Date().toISOString()}`,
    content: Buffer.from(JSON.stringify(content, null, 2)).toString("base64"),
    ...(sha ? { sha } : {}),
  };
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub PUT ${path} failed: ${res.status} ${text}`);
  }
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
    return [];
  }
}

async function pushToNtfy(item) {
  if (!NTFY_TOPIC) return;
  try {
    await fetch(`${NTFY_SERVER}/${NTFY_TOPIC}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Title": item.tier === "major" ? "Major breaking" : item.headline.slice(0, 60),
        "X-Priority": item.tier === "major" ? "5" : item.tier === "developing" ? "4" : "3",
      },
      body: JSON.stringify(item),
    });
  } catch (err) {
    console.error("ntfy push failed:", err.message);
  }
}

module.exports = async (req, res) => {
  if (req.query.secret !== POLL_SECRET) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  try {
    const { content: existingState, sha: stateSha } = await githubGetFile("state.json");
    const state = existingState || { items: [], sourceStatus: {} };
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

    const cutoff = now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    state.items = state.items.filter((i) => new Date(i.publishedAt).getTime() >= cutoff);

    await githubPutFile("state.json", state, stateSha);

    const { sha: latestSha } = await githubGetFile("latest.json");
    await githubPutFile(
      "latest.json",
      {
        updatedAt: now.toISOString(),
        sourceStatus: state.sourceStatus,
        items: state.items.slice(-LATEST_FEED_SIZE),
      },
      latestSha
    );

    // Parallel rather than sequential — pushing 10+ new items one at a
    // time could by itself add several seconds, eating into the function's
    // time budget for no reason since these pushes are independent.
    await Promise.all(newlyStoredItems.map(pushToNtfy));
    res.status(200).json({ ok: true, newItems: newlyStoredItems.length, total: state.items.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// Vercel Hobby defaults to a 10-second timeout, which fetching ~20 feeds
// plus a couple of GitHub API round-trips can occasionally exceed on a
// slow run. 60 is the max Hobby allows without enabling Fluid compute.
module.exports.config = {
  maxDuration: 60,
};
