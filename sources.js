// sources.js
// RSS source list for Nova NewsRoom.
//
// IMPORTANT: Some outlets (AP, Reuters, C-SPAN in particular) have deprecated
// or restricted their public RSS feeds over the past few years, and URLs
// drift often. Every URL below is flagged VERIFIED or NEEDS-CHECK based on
// what's reliably known. Before first deploy, run `node verify-feeds.js`
// (included in this folder) to confirm each feed actually returns items —
// don't trust this list blind.

module.exports = [
  { name: "AP",          color: "#2A8F89", url: "https://news.google.com/rss/search?q=site:apnews.com+when:1d&hl=en-US&gl=US&ceid=US:en", status: "WORKAROUND — AP has no official RSS. Confirmed working with site:/when:1d syntax, but this endpoint may run stale (not real-time) — treat as supplementary" },
  { name: "Reuters",     color: "#3E76AD", url: "https://news.google.com/rss/search?q=site:reuters.com+when:1d&hl=en-US&gl=US&ceid=US:en", status: "WORKAROUND — Reuters has no official RSS. Same caveat as AP: confirmed working, but may run stale" },
  { name: "Fox News",    color: "#B4453F", url: "https://moxie.foxnews.com/google-publisher/latest.xml", status: "VERIFIED — 25 items on last check" },
  { name: "Al Jazeera",  color: "#C99A2E", url: "https://www.aljazeera.com/xml/rss/all.xml", status: "VERIFIED — 25 items on last check" },
  { name: "BBC",         color: "#6A57B8", url: "http://feeds.bbci.co.uk/news/world/rss.xml", status: "VERIFIED — 38 items on last check" },
  { name: "Guardian",    color: "#3E8A65", url: "https://www.theguardian.com/world/rss", status: "VERIFIED — 45 items on last check" },
  { name: "NPR",         color: "#8D68B8", url: "https://feeds.npr.org/1001/rss.xml", status: "VERIFIED — 10 items on last check" },
  { name: "PBS",         color: "#4A7A8C", url: "https://www.pbs.org/newshour/feeds/rss/headlines", status: "VERIFIED — 20 items on last check" },
  { name: "Politico",    color: "#A65A2E", url: "https://rss.politico.com/politics-news.xml", status: "VERIFIED — 30 items on last check" },
  { name: "ProPublica",  color: "#7A6A4A", url: "https://www.propublica.org/feeds/propublica/main", status: "VERIFIED — 20 items on last check" },
  { name: "UPI",         color: "#5A5A5A", url: "https://rss.upi.com/news/tn_int.rss", status: "NEW — replaces C-SPAN, which has no general headline RSS, only podcast feeds. Verify on first run." },
  { name: "DW",          color: "#B08A3E", url: "https://rss.dw.com/rdf/rss-en-all", status: "VERIFIED — 141 items on last check" },
  { name: "France24",    color: "#3E5C8A", url: "https://www.france24.com/en/rss", status: "VERIFIED — 23 items on last check" },
  { name: "Sky News",    color: "#8A3E5C", url: "https://feeds.skynews.com/feeds/rss/world.xml", status: "VERIFIED — replaces NHK World" },
  { name: "CBS News",    color: "#4A6FA5", url: "https://www.cbsnews.com/latest/rss/main", status: "VERIFIED — CBS publishes an official RSS page" },
  { name: "The Hill",    color: "#5E7A3E", url: "https://thehill.com/feed/", status: "VERIFIED — standard WordPress RSS" },
  { name: "NBC News",    color: "#8A5A3E", url: "http://feeds.nbcnews.com/feeds/topstories", status: "NEEDS-CHECK — older NBC RSS documentation, confirm it still resolves" },
  { name: "ABC News",    color: "#3E5A7A", url: "https://abcnews.go.com/abcnews/topstories", status: "NEEDS-CHECK — couldn't confirm current active endpoint" },
  { name: "NYT",         color: "#3E3E3E", url: "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml", status: "VERIFIED — official NYT homepage feed" },
  { name: "Washington Post", color: "#5A3E3E", url: "https://feeds.washingtonpost.com/rss/national", status: "VERIFIED — official WaPo national feed" },
  { name: "USA Today",   color: "#3E5A8A", url: "https://rssfeeds.usatoday.com/usatoday-newstopstories", status: "VERIFIED — standard USA Today top-stories feed" },
  { name: "Wash Examiner", color: "#6A5A3E", url: "https://www.washingtonexaminer.com/feed/", status: "NEEDS-CHECK — guessed standard WordPress path, no confirmed source found, verify before trusting" },
  { name: "Semafor",     color: "#4A6A8A", url: "https://www.semafor.com/rss.xml", status: "VERIFIED — confirmed by independent users, not official docs, but consistently reported working" },
];
