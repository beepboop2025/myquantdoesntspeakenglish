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
clock. A story may explain or investigate a reported event, but the house's own
contribution must be named. Prefer primary sources, expose disagreements, and
state what evidence would change the conclusion. Specialist copy remains linked
at its canonical URL and is never silently presented as house reporting.

The subjective editorial choice is isolated in `EDITORIAL_WEIGHTS` inside
`scripts/lib.mjs`. Changing those few values changes which qualifying story leads
the homepage without weakening any evidence gate.
