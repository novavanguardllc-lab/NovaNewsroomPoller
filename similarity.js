// similarity.js
// Lightweight, non-AI corroboration matching: compares a new headline
// against recent headlines from OTHER sources and scores word overlap.
// This is intentionally simple (per spec: keyword/text similarity only,
// no AI, imperfect matches accepted) rather than semantic matching.

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "as", "is", "are", "was", "were", "be",
  "been", "being", "have", "has", "had", "do", "does", "did", "will",
  "would", "could", "should", "may", "might", "must", "can", "this",
  "that", "these", "those", "it", "its", "into", "over", "after",
  "before", "than", "then", "new", "says", "say", "said",
]);

function extractKeywords(headline) {
  return headline
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

// Returns overlap score 0-1 (fraction of shorter headline's keywords
// that also appear in the other headline).
function similarityScore(headlineA, headlineB) {
  const wordsA = new Set(extractKeywords(headlineA));
  const wordsB = new Set(extractKeywords(headlineB));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }
  const shorterSize = Math.min(wordsA.size, wordsB.size);
  return overlap / shorterSize;
}

const SIMILARITY_THRESHOLD = 0.45; // tune after real-world testing
const CORROBORATION_WINDOW_MINUTES = 90;

// items: array of { headline, source, publishedAt } already stored,
// newItem: the incoming candidate.
// Returns array of matching items from DIFFERENT sources within the window.
function findCorroboratingItems(newItem, recentItems) {
  const windowStart = Date.now() - CORROBORATION_WINDOW_MINUTES * 60 * 1000;
  return recentItems.filter((existing) => {
    if (existing.source === newItem.source) return false;
    if (new Date(existing.publishedAt).getTime() < windowStart) return false;
    return similarityScore(newItem.headline, existing.headline) >= SIMILARITY_THRESHOLD;
  });
}

// Watchlist matching: a watched topic is defined by a fixed set of
// keywords (extracted once, from the story you chose to watch). Unlike
// corroboration — which compares two headlines to each other — this
// checks what fraction of the TOPIC's keywords show up in a new headline,
// since a topic's keyword set is usually small (5-8 words) and doesn't
// shrink over time the way a rolling headline-to-headline comparison would.
const WATCHLIST_THRESHOLD = 0.5;

function watchlistMatchScore(headline, watchlistKeywords) {
  if (!watchlistKeywords || watchlistKeywords.length === 0) return 0;
  const headlineWords = new Set(extractKeywords(headline));
  let overlap = 0;
  for (const w of watchlistKeywords) {
    if (headlineWords.has(w)) overlap++;
  }
  return overlap / watchlistKeywords.length;
}

function matchesWatchlistTopic(headline, watchlistKeywords) {
  return watchlistMatchScore(headline, watchlistKeywords) >= WATCHLIST_THRESHOLD;
}

module.exports = {
  extractKeywords,
  similarityScore,
  findCorroboratingItems,
  SIMILARITY_THRESHOLD,
  CORROBORATION_WINDOW_MINUTES,
  watchlistMatchScore,
  matchesWatchlistTopic,
  WATCHLIST_THRESHOLD,
};
