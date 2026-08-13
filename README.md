# my quant doesn’t speak english

The public editorial and advertising front door for the Liquidity Lab family:
Seiche, LiquiLens, and LiquiLens—Undertow.

The site consumes each product's structured evidence feed at build time. Its
`SOURCE_PUBLISHED` website mode lists every record the source marks published and
links to the canonical source rather than copying the article body. The mobile
app feed is independently `SUSPENDED` and contains zero stories. Original house
reporting lives in `content/` and must declare its sources and publication status.

```bash
npm test
npm run sync
npm run dev
```

The build has no runtime dependencies. If a source is temporarily unavailable,
it uses the last successful `data/cache.json` slice for that source and prints the
coverage state in the generated page.

The scheduled `sync evidence wire` workflow refreshes that cache daily at
12:17 UTC. A changed public feed produces one small content commit, which becomes
the deployment trigger; an unchanged wire produces no commit and no redeploy.

## Editorial rule

Automation may collect and normalize published records. It may not manufacture a
fact, silently infer calm from a missing feed, or publish a house investigation
without the source and evidence fields described in `content/README.md`.

Website archive mode is an operator distribution instruction, not a claim that
every source record received legal or regulatory clearance. Corrections,
retractions, canonical links, content boundaries, and the emergency stop remain
active. The homepage teaser is first-party silent creative documented in
`assets/media/`; restricted motion-picture files must never be restored there.
