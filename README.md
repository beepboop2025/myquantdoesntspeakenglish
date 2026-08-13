# my quant doesn’t speak english

The public editorial and advertising front door for the Liquidity Lab family:
Seiche, LiquiLens, and LiquiLens—Undertow.

The site consumes each product's structured editorial feed at build time. Its
`SOURCE_PUBLISHED` website mode gives every record the source marks published a
MyQuant reading page, while preserving the specialist's canonical URL, exact
claim, evidence clocks, fingerprint, and limitation. The mobile app feed is
independently `SUSPENDED` and contains zero stories.

The public site has two explicit lanes:

- `Interpreted`: plain-English readings of Seiche, LiquiLens, and Undertow work;
- `MyQuant Analysis`: independently sourced house reporting on important news.

The Interpreted lane includes reviewed longforms and LiquiLens historical case
files. Case files display each lens's `HIT`, `MISS`, or `VOID` separately and
state whether the replay was reconstructed later. They are not silently
promoted into real-time calls or validated-backtest evidence.

Original house reporting lives in `content/` and must declare its sources,
contribution, limitations, and publication status.

```bash
npm test
npm run sync
npm run dev
```

The build has no runtime dependencies. If a source is temporarily unavailable,
it uses the last successful `data/cache.json` slice for that source and prints the
coverage state in the generated page.

The scheduled `sync evidence wire` workflow checks seven upstream publication
channels at
02:17, 08:17, 14:17, and 20:17 UTC. A changed evidence fingerprint produces one
small content commit, which becomes the deployment trigger; an unchanged network
produces no commit and no redeploy. Frequency is a check cadence, not a quota.

## Editorial rule

Automation may collect and normalize published records. It may not manufacture a
fact, silently infer calm from a missing feed, or publish a house investigation
without the source and evidence fields described in `content/README.md`.

Website archive mode is an operator distribution instruction, not a claim that
every source record received legal or regulatory clearance. Corrections,
retractions, canonical links, content boundaries, and the emergency stop remain
active. The homepage uses a first-party silent cinema cut derived from the
approved app launch creative and documented in `assets/media/`.
