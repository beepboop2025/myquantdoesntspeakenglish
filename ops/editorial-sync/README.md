# MyQuant recurring editorial sync

The GitHub Actions `sync-wire.yml` schedule was disabled without a replacement.
This operator replaces its four daily checks on the existing Hetzner host. It
uses the same seven public sources and the existing deterministic sync code.
There are no model calls, new editorial composition, paid calls, account changes
or mobile-app publication. The app feed must remain `SUSPENDED` and empty.

The controller is installed separately from the repository it runs. A normal
repository update cannot replace the installed controller or its timer. The
only pushed change is `data/cache.json`; normal Git fast-forward rules preserve
concurrent author work. Vercel builds the committed cache, then the operator
requires the expected Git SHA both before and after reading the exact generated
public feed bytes and the suspended app feed. Healthy no-change runs perform the
same publication proof and retain a timestamped heartbeat without creating a
commit. The cache's own source/retrieval clocks are never rewritten by this
operator.

## Owner installation

The root release owner installs a reviewed, exact source revision under
`/usr/local/libexec/myquant-editorial-sync/<source-sha>/`, root-owned and not
writable by the service user, and points the root-owned `current` link to it.
Install this directory's service/timer files without altering other product
units. Create the unprivileged `myquant-editorial-sync` system user with no
interactive login. `StateDirectory` supplies its private writable directory.

Generate a dedicated SSH deploy key and register **only** repository write
access for `beepboop2025/myquantdoesntspeakenglish`. Do not reuse a fleet key,
agent socket, personal Git credential or model key. Keep the key and
`config.json` under `/etc/myquant-editorial-sync`, readable only by the service
user or root (mode 0600/0400). Supply a pinned, independently verified GitHub SSH
host-key file at `known_hosts`, with the same private ownership/mode. The
operator refuses host-key prompting, inherited SSH agents, general Git config
and Git hooks. The config accepts only the five paths in the example; repository
and public origin are fixed in the reviewed controller.

Set `node` and `npm` to the existing Node 22+ installation's absolute executable
paths. No dependencies are currently installed; adding dependencies or npm
lifecycle hooks requires another reviewed controller policy. The subprocess
environment omits model credentials and `MYQUANT_USE_REVIEWED_CACHE`, so this
job performs the ordinary seven-source refresh. Vercel itself must retain
`MYQUANT_USE_REVIEWED_CACHE=1 npm run build`.

Before activation, the owner runs the exact installed bytes as the service user:

```sh
python3 -m unittest discover -s ops/editorial-sync -p 'test_*.py' -v
sudo -u myquant-editorial-sync /usr/bin/python3 /usr/local/libexec/myquant-editorial-sync/current/editorial_sync.py --config /etc/myquant-editorial-sync/config.json --dry-run
systemd-analyze verify /etc/systemd/system/myquant-editorial-sync.service /etc/systemd/system/myquant-editorial-sync.timer
```

Dry-run uses a new private clone, runs tests, normal source sync, build verifier
and the actual API feed reader, and records the resulting hashes/counts. It
does not commit or push. A changed dry-run does not claim its candidate is live.
The release owner may then start the service once, verify its source/feed/app
proof and immutable first-success receipt, and enable the timer. This source
directory deliberately contains no privileged installer or automatic key
registration. GitHub Actions need not be re-enabled.

## Admission, recovery and monitoring

Every run uses a stable nonblocking file lock, a new clone of exact current
`main`, sanitized subprocess environment and bounded subprocess deadlines. The
order is `npm test`, `npm run sync`, `npm run verify`, then loading the generated
feed with the production API reader. Tracked changes other than the cache and
unexpected untracked files fail before any commit. Ignored build output stays
inside the disposable clone. Symlink/deleted/executable caches are refused.
Remote main must remain the selected parent before push; the push is explicit
`HEAD:refs/heads/main`, with no force. A concurrent commit wins normally and the
next scheduled run rebuilds from that main.

Receipts under `state/receipts` are complete JSON files atomically published
without replacement. A started receipt precedes work; a prepared receipt names
the exact candidate before push; a confirmed receipt records remote acceptance;
and a result/failure receipt retains the outcome. Every record has the installed
controller hash. Raw command output is not retained or echoed: step name,
return code, size and SHA256 are enough to identify the failed stage without
exposing credentials. An interrupted clone is disposable, while its receipts
remain. A run killed after push is recovered by the next fresh clone/no-change
publication check. `first-success.json` is never overwritten. No receipt or
source rollback erases another writer's work.

Publication checks retry every 20 seconds for at most 10 minutes (each HTTP read
also has a 20-second timeout) to allow Vercel deployment. A mismatch fails the
unit and retains the pushed candidate/proof failure; it does not force an old
commit over current main. The next run checks the selected source again. A
source fallback remains explicitly `cached`; even if publication passes, that
run is `degraded` and exits nonzero. It cannot create a first healthy receipt.

Check `systemctl status myquant-editorial-sync.timer`, the next/last activation,
and `journalctl -u myquant-editorial-sync.service`. Inspect the newest immutable
result/failure receipt and the first successful receipt, not only the timer's
active flag. A healthy four-times-daily schedule should have a successful
timestamp within the previous eight hours; `started` or `push-confirmed` alone
is not success. The receipt reports each source state, cache timestamp, item
count, exact feed hash and proved deployed SHA. Host monitoring should alert on
the service failure or missed receipt; this operator itself sends no messages.

The test suite uses real temporary Git remotes and fake ordinary build/HTTP
fixtures: cache-only commits, no-change proof, dry runs, competing pushes,
post-push interruptions, preserved failure/first-success records, malformed
artifacts, app suspension, source policy, deadlines and lock contention. It
does not contact production or require a deploy key.
