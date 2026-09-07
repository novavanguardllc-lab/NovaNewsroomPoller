// Tier classification (how urgently a story should interrupt you) and
// topic classification (which content tab it belongs in).
//
// CHANGED FROM THE FIREBASE VERSION: the old hasUrgencyKeyword() check has
// been removed entirely. It was promoting single-source, zero-corroboration
// stories straight to "major" purely because the headline contained a word
// like "arrested," "shooting," or "attack" — regardless of how many outlets
// had actually confirmed it. Tier is now derived ONLY from who's reporting
// it and how fast, never from headline text. This kills false-urgency at
// the source instead of trying to blacklist trigger words one at a time.

const WIRE_SOURCES = ["AP", "Reuters", "UPI"];

// Sports vocabulary for topic routing — unchanged from the original.
const SPORTS_KEYWORDS = [
  "nfl", "nba", "mlb", "nhl", "playoffs", "playoff", "touchdown",
  "quarterback", "trade deadline", "draft pick", "world series",
  "super bowl", "stanley cup", "olympics", "championship", "tournament",
  "clinch", "home run", "head coach", "grand slam", "final four",
  "world cup", "premier league", "fifa", "ncaa", "heisman",
];

function isSportsHeadline(headline) {
  const lower = headline.toLowerCase();
  return SPORTS_KEYWORDS.some((k) => lower.includes(k));
}

// tier: "major" | "developing" | "routine"
// - major: wire source (AP/Reuters/UPI) alone, OR 4+ corroborating sources,
//   OR 3+ sources within a tight 20-min window (fast-breaking pattern).
// - developing: cleared the 2-source corroboration bar but didn't hit
//   any major criteria.
// - routine: single source, no corroboration yet — stored but no push.
function classifyTier({ item, corroboratedCount, matchingItems, isWireSource }) {
  if (isWireSource) return "major";
  if (corroboratedCount >= 4) return "major";

  const now = Date.now();
  const within20Min =
    matchingItems.filter((m) => now - new Date(m.publishedAt).getTime() <= 20 * 60 * 1000).length + 1;
  if (within20Min >= 3) return "major";

  if (corroboratedCount >= 2) return "developing";
  return "routine";
}

function classifyTopic(headline) {
  return isSportsHeadline(headline) ? "sports" : "news";
}

module.exports = { classifyTier, classifyTopic, WIRE_SOURCES };
