# House article contract

Each JSON file in this directory is an original article. A publishable record has:

- a unique `slug`, title, dek, author, and ISO publication time;
- `publication_status: "PUBLISHED"` (drafts stay out of the public build);
- at least one HTTPS source with a human-readable label;
- an explicit `evidence_status` and `limitations` array;
- structured sections containing paragraphs, never fetched third-party HTML.

For live-news articles, record the event clock separately from the publication
clock. A story may explain or investigate a reported event, but the house's own
contribution must be named. Wire copy and product dispatches remain links, not
republished bodies.

The subjective editorial choice is isolated in `EDITORIAL_WEIGHTS` inside
`scripts/lib.mjs`. Changing those few values changes which qualifying story leads
the homepage without weakening any evidence gate.
