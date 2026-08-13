# MyQuant Analysis contract

Each JSON file in this directory is an original house article. On the public site,
`house_investigation` is labelled **MyQuant Analysis** and `house_note` is labelled
**House Note**. A publishable record has:

- a unique `slug`, title, dek, author, and ISO publication time;
- `publication_status: "PUBLISHED"` (drafts stay out of the public build);
- at least one HTTPS source with a human-readable label;
- an explicit `evidence_status` and `limitations` array;
- structured sections containing paragraphs, never fetched third-party HTML.

For live-news articles, record the event clock separately from the publication
clock and use `article_type: "news_analysis"`. The build rejects the article
unless all of the following are present:

- a newsworthiness score from 3 to 5 with a written reason;
- one or more `primary_event` sources, each with a unique release ID and event
  time; the article event clock must equal the newest primary event;
- a knowledge clock after every primary event and no later than publication;
- a named original contribution and network relevance;
- the best countercase, a falsifier, revision risk, and a forecast boundary;
- `recommendation_status: "NONE"`.

Those gate fields render in a public news-analysis ledger. A story may explain
or investigate a reported event, but the house's own contribution must be named.
Specialist copy remains linked at its canonical URL and is never silently
presented as house reporting.

The subjective editorial choice is isolated in `EDITORIAL_WEIGHTS` inside
`scripts/lib.mjs`. Changing those few values changes which qualifying story leads
the homepage without weakening any evidence gate.
