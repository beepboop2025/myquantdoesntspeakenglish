# myquantdoesntspeakenglish.com

The public editorial and advertising front door for the Liquidity Lab family:
Seiche, LiquiLens, and LiquiLens—Undertow.

The site consumes each product's structured evidence feed at build time. It lists
every supplied record and links to the canonical source rather than copying the
article body. Original house reporting lives in `content/` and must declare its
sources and publication status.

```bash
npm test
npm run sync
npm run dev
```

The build has no runtime dependencies. If a source is temporarily unavailable,
it uses the last successful `data/cache.json` slice for that source and prints the
coverage state in the generated page.

## Editorial rule

Automation may collect and normalize published records. It may not manufacture a
fact, silently infer calm from a missing feed, or publish a house investigation
without the source and evidence fields described in `content/README.md`.
