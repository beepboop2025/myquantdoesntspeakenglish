# my quant doesn’t speak english mobile MVP

## Product promise

Five market stories that matter today, translated into normal English with the
evidence boundary attached.

The app is financial news and research for curious non-specialists. It is not a
trading interface, portfolio adviser, price forecast, credit rating, or breaking
news service.

## First release

The first release has four destinations:

1. **Today** — a finite daily edition, led by the most useful current record.
2. **Topics** — funding, institutions, market exits, and house investigations.
3. **Saved** — device-local bookmarks that remain readable offline.
4. **Settings** — accessibility state, privacy, support, methodology, and
   research boundaries.

Every story answers the same questions:

- **Quant says** — the source signal without changing its claim.
- **In English** — a short translation for a non-specialist.
- **Why it matters** — the mechanism or decision context, never a trade call.
- **One number** — only when a number is present in the source record.
- **Evidence** — product, status, publication clock, canonical source, and the
  strongest available limitation.

## Editorial contract

Consumer copy must not introduce a fact that is absent from the normalized
source or a reviewed house article. Automated fallbacks may simplify labels and
structure, but they must not infer causality, direction, severity, or advice.

Only records with completed, human-reviewed `inEnglish` and `whyItMatters`
fields enter the consumer feed. Upstream publication alone is not app
publication; unreviewed records remain available on the evidence wire until the
translation is complete.

Missing and degraded evidence remain visible. `PARTIAL` never becomes “calm.” A
quiet dispatch remains quiet instead of being promoted into breaking news.

The versioned app feed should include:

- stable story and edition identifiers;
- source and product labels;
- technical title and plain-language presentation fields;
- publication, event, and knowledge clocks;
- evidence status, contribution, limitation, and canonical URL;
- a deterministic content fingerprint for offline cache replacement.

## Deliberate omissions

The MVP has no login, comments, social graph, portfolio import, brokerage links,
personalized investment advice, subscription, advertising SDK, or generative
chatbot. These omissions keep the first release private, reviewable, and useful.

## Visual direction

The phone experience uses the website's Carbon, Paper, Cobalt, Lemon, Papaya,
and Periwinkle palette. The signature component is a two-part subtitle card:
`QUANT SAYS` preserves the source wording and `IN ENGLISH` carries the consumer
translation. Everything else stays quiet enough for that contrast to work.

Movie footage and unlicensed third-party stills are excluded from the app and
store listing. The cinematic tone comes from original typography, pacing, and
copy.

## Release gate

Before TestFlight, the app must pass TypeScript checks, load a bundled edition
without a network connection, recover from a malformed remote feed, preserve
saved stories across launches, expose source links and limitations, and remain
usable with large text and reduced motion.
