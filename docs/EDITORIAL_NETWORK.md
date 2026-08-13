# Editorial network contract

## Public roles

Seiche reports on system funding and market plumbing. LiquiLens reports on
institution-level public records. Undertow reports on market exits, liquidity,
and incomplete coverage. MyQuant publishes a distinct plain-English reading page
for each source-published record and separately publishes its own sourced analysis
of important news.

The specialist owns the underlying claim. MyQuant owns the explanation. An
interpretation must preserve the source title, summary, canonical URL, evidence
status, event and knowledge clocks, fingerprint, contribution, and limitation.
It may add a bounded analogy or explain an existing taxonomy. It may not add a
new market fact or a stronger conclusion. New facts belong in MyQuant Analysis
and require their own sources and caveats.

## Article types

- `analysis`: a bounded finding anchored to current or recent evidence;
- `investigation`: a deeper original synthesis with claims and citations;
- `editorial`: an argued position that distinguishes fact from judgment;
- `case_file`: a historical point-in-time reconstruction of what was knowable,
  what the model printed, what happened later, and whether the call hit or missed.

Historical case files must disclose whether their inputs were frozen at the time
or reconstructed later. They must define the outcome window before grading and
use one of `HIT`, `PARTIAL`, `MISS`, `VOID`, or `NOT_A_FORECAST`. Misses stay in
the archive. A backtest result may attract attention, but the headline cannot be
stronger than the body or hide its denominator.

The current LiquiLens case-file feed grades the action-zone and funding-fragility
lenses separately. A case may therefore be `HIT/MISS`, `MISS/HIT`, or include a
`VOID` when a lens was not scoreable. MyQuant renders those verdicts as separate
cards and never computes a flattering combined grade.

## Publication cadence

Automation checks for new evidence four times daily. It publishes only when the
source supplies a new record or a content fingerprint changes. No-change runs
abstain. A correction, retraction, supersession, or emergency stop applies before
an interpretation page is written.

## MyQuant reading format

Every specialist reading page answers five questions:

1. What did the specialist actually say?
2. What does that mean in ordinary language?
3. Why might it matter?
4. What is a useful mental model?
5. Where does the evidence stop?

Reviewed consumer copy is labelled `REVIEWED`. Deterministic copy that only
rearranges source fields and controlled taxonomy is labelled `SOURCE_GROUNDED`.
Neither label represents legal or regulatory clearance.

The public JSON Feed keeps the standard JSON Feed 1.1 fields and adds an
`_mqdnse` extension to every item. That extension carries the source record ID,
canonical source URL, fingerprint, event and knowledge clocks, evidence status,
contribution, limitation, copy state, and source list. It is the bounded input
for downstream corpus capture; the collector must reject the feed if the
extension disappears or changes shape.

## News analysis gate

MyQuant Analysis may cover a relevant outside event when it has a primary-source
event record, a material connection to the network's beats, an original analytical
contribution, an explicit countercase, and a named limitation. Speed never waives
those fields. The build also requires ordered event, knowledge, and publication
clocks; unique primary release IDs; a newsworthiness score of at least 3 out of 5;
a falsifier; revision risk; a forecast boundary; and an explicit `NONE` for any
transaction recommendation. The page exposes that ledger to readers. If the desk
cannot establish every field, the correct output is no article.
