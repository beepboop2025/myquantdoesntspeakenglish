#!/usr/bin/env python3
"""Refresh the ordinary editorial cache; install separately from the git clone.

No model, paid, account, app-publication or self-update operation exists here.
The CLI accepts only the fixed product repo and origin. Tests inject local git
and HTTP fixtures into the same transaction implementation.
"""
from __future__ import annotations

import argparse
import contextlib
import ctypes
import dataclasses
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import signal
import stat
import subprocess
import tempfile
import time
import urllib.request
import uuid

REPOSITORY = "git@github.com:beepboop2025/myquantdoesntspeakenglish.git"
ORIGIN = "https://myquantdoesntspeakenglish.com"
CACHE = "data/cache.json"
SOURCES = {
    "liquilens-desk": "https://api.liquilens.in/api/experimental/v1/desk/bits",
    "liquilens-investigations": "https://liquilens.in/investigations/index.json",
    "liquilens-case-files": "https://liquilens.in/replay/index.json",
    "seiche-dispatches": "https://seiche.info/dispatches/news.json",
    "seiche-investigations": "https://seiche.info/investigations/index.json",
    "undertow-dispatches": "https://api.seiche.info/undertow/dispatch.json",
    "undertow-investigations": "https://liquilens-undertow.com/investigations/index.json",
}
MAX_FILE = 16 * 1024 * 1024


class Refused(RuntimeError):
    """A bounded, credential-free operational failure."""


class Busy(Refused):
    pass


def utc() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def digest(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


def read_file(path: Path, limit: int = MAX_FILE) -> bytes:
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as handle:
        before = os.fstat(handle.fileno())
        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or before.st_size > limit:
            raise Refused("file is not a bounded ordinary file")
        body = handle.read(limit + 1)
        after = os.fstat(handle.fileno())
        fields = ("st_dev", "st_ino", "st_mode", "st_nlink", "st_uid", "st_gid",
                  "st_size", "st_mtime_ns", "st_ctime_ns")
        if any(getattr(before, k) != getattr(after, k) for k in fields) or len(body) > limit:
            raise Refused("file changed during read")
        return body


def document(path: Path) -> dict:
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise Refused("duplicate JSON key")
            result[key] = value
        return result
    result = json.loads(read_file(path), object_pairs_hook=pairs)
    if not isinstance(result, dict):
        raise Refused("expected a JSON object")
    return result


def private_file(path: Path) -> None:
    info = path.lstat()
    if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1
            or info.st_uid not in {0, os.geteuid()} or info.st_mode & 0o077):
        raise Refused("credential/config permissions are not private")


def private_dir(path: Path) -> None:
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077:
        raise Refused("state directory is not private and owned by the operator")


def fsync_dir(path: Path) -> None:
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def exclusive_json(path: Path, value: dict) -> None:
    body = (json.dumps(value, sort_keys=True, indent=2, allow_nan=False) + "\n").encode()
    pending = path.parent / (".pending-" + uuid.uuid4().hex)
    fd = os.open(pending, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(body)
            handle.flush()
            os.fsync(handle.fileno())
        # Publish complete immutable evidence without replacing a foreign or
        # earlier receipt. Linux production and macOS developer fixtures have
        # native no-replace rename; unsupported hosts fail before publication.
        libc = ctypes.CDLL(None, use_errno=True)
        if hasattr(libc, "renameat2"):
            rc = libc.renameat2(-100, os.fsencode(pending), -100, os.fsencode(path), 1)
        elif hasattr(libc, "renamex_np"):
            rc = libc.renamex_np(os.fsencode(pending), os.fsencode(path), 4)
        else:
            raise Refused("atomic no-replace receipt publication is unavailable")
        if rc != 0:
            error = ctypes.get_errno()
            raise OSError(error, os.strerror(error))
        fsync_dir(path.parent)
    finally:
        pending.unlink(missing_ok=True)


@dataclasses.dataclass(frozen=True)
class Config:
    state: Path
    ssh_key: Path
    known_hosts: Path
    repository: str = REPOSITORY
    origin: str = ORIGIN
    node: str = "/usr/bin/node"
    npm: str = "/usr/bin/npm"
    command_timeout: int = 300
    publication_timeout: int = 600
    retry_seconds: int = 20


def load_config(path: Path) -> Config:
    private_file(path)
    raw = document(path)
    if set(raw) != {"state", "ssh_key", "known_hosts", "node", "npm"}:
        raise Refused("config must contain exactly state, ssh_key, known_hosts, node, npm")
    if not all(isinstance(v, str) and v.startswith("/") for v in raw.values()):
        raise Refused("config paths must be absolute")
    cfg = Config(**{k: Path(v) if k in {"state", "ssh_key", "known_hosts"} else v
                    for k, v in raw.items()})
    private_file(cfg.ssh_key)
    private_file(cfg.known_hosts)
    return cfg


@contextlib.contextmanager
def locked(state: Path):
    private_dir(state)
    fd = os.open(state / "sync.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(fd)
        if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1
                or info.st_uid != os.geteuid() or info.st_mode & 0o077):
            raise Refused("unsafe existing lock")
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Busy("another editorial sync holds the lock") from None
        yield
    finally:
        os.close(fd)


class Runner:
    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.steps = []
        ssh = ["/usr/bin/ssh", "-F", "/dev/null", "-i", str(cfg.ssh_key),
               "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes",
               "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=15",
               "-o", "UserKnownHostsFile=" + str(cfg.known_hosts)]
        self.env = {"PATH": str(Path(cfg.node).parent) + ":/usr/bin:/bin",
                    "LANG": "C.UTF-8", "TZ": "UTC", "GIT_TERMINAL_PROMPT": "0",
                    "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": "/dev/null",
                    "GIT_SSH_COMMAND": shlex.join(ssh),
                    "npm_config_cache": str(cfg.state / "npm-cache"),
                    "npm_config_audit": "false", "npm_config_fund": "false"}

    def run(self, name: str, args: list[str], cwd: Path | None = None) -> str:
        with tempfile.TemporaryFile() as output:
            proc = subprocess.Popen(args, cwd=cwd, env=self.env,
                                    stdin=subprocess.DEVNULL, stdout=output,
                                    stderr=subprocess.STDOUT, start_new_session=True)
            try:
                code = proc.wait(timeout=self.cfg.command_timeout)
            except subprocess.TimeoutExpired:
                os.killpg(proc.pid, signal.SIGKILL)
                proc.wait()
                self.steps.append({"step": name, "timeout": True})
                raise Refused(name + " exceeded its deadline") from None
            size = output.tell()
            output.seek(0)
            body = output.read(MAX_FILE + 1)
        self.steps.append({"step": name, "returncode": code,
                           "output_bytes": size, "output_sha256": digest(body)})
        # Subprocess text can contain credentials or upstream bodies. Retain
        # only its digest/size and a fixed stage name, never echo raw stderr.
        if code != 0 or size > MAX_FILE:
            raise Refused(name + " failed")
        return body.decode("utf-8", errors="strict").strip()

    def git(self, cwd: Path, *args: str, name: str = "git") -> str:
        return self.run(name, ["git", "-c", "core.hooksPath=/dev/null", *args], cwd)


def assert_repository_policy(repo: Path, runner: Runner) -> None:
    pkg = document(repo / "package.json")
    scripts = pkg.get("scripts", {})
    if any(scripts.get(k) != v for k, v in {
        "sync": "node scripts/build.mjs", "test": "node --test",
        "verify": "node scripts/verify-build.mjs"}.items()):
        raise Refused("the ordinary sync/test/verify commands changed")
    if any(k.startswith(("pre", "post")) for k in scripts):
        raise Refused("npm lifecycle hooks require operator review")
    if pkg.get("dependencies") or pkg.get("devDependencies"):
        raise Refused("new dependencies require a separately reviewed installation policy")
    if document(repo / "vercel.json").get("buildCommand") != "MYQUANT_USE_REVIEWED_CACHE=1 npm run build":
        raise Refused("deployment must build the committed cache")
    policy = document(repo / "data/release-policy.json")
    if (policy.get("emergencyStop") is not False
            or policy.get("channels", {}).get("site", {}).get("mode") != "SOURCE_PUBLISHED"
            or policy.get("channels", {}).get("app-feed", {}).get("mode") != "SUSPENDED"):
        raise Refused("site/app publication policy changed")
    sources = runner.run("source-list", [runner.cfg.node, "--input-type=module", "-e",
        "import {SOURCES} from './scripts/lib.mjs'; console.log(JSON.stringify(SOURCES.map(({id,url})=>({id,url}))))"], repo)
    rows = json.loads(sources)
    if len(rows) != len(SOURCES) or {r["id"]: r["url"] for r in rows} != SOURCES:
        raise Refused("the approved seven ordinary source URLs changed")


def assert_cache_only(repo: Path, runner: Runner) -> bool:
    changed = runner.git(repo, "diff", "--name-only", "HEAD", "--").splitlines()
    untracked = runner.git(repo, "ls-files", "--others", "--exclude-standard", "--").splitlines()
    if set(changed) - {CACHE} or untracked:
        raise Refused("build changed paths other than data/cache.json")
    # Reject deletion, symlink and executable-bit substitutions before staging.
    info = (repo / CACHE).lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_mode & 0o111:
        raise Refused("cache is not an ordinary non-executable file")
    return bool(changed)


def artifact_proof(repo: Path) -> dict:
    cache = document(repo / CACHE)
    if (cache.get("schema") != "mqdnse.feed-cache.v2"
            or set(cache.get("channels", {})) != set(SOURCES)
            or set(cache.get("channelStatuses", {})) != set(SOURCES)):
        raise Refused("cache no longer describes the seven ordinary channels")
    statuses = {k: v.get("state") for k, v in cache["channelStatuses"].items()}
    if set(statuses.values()) - {"live", "cached"}:
        raise Refused("cache contains an unknown source state")
    app = document(repo / "dist/app-feed/v1.json")
    if (app.get("schema") != "mqdnse.app-feed.v1" or app.get("releaseStatus") != "SUSPENDED"
            or app.get("stories") != []):
        raise Refused("app feed is not suspended and empty")
    feed_bytes = read_file(repo / "dist/feed.json")
    feed = json.loads(feed_bytes)
    if (feed.get("_mqdnse", {}).get("appDistribution") != "SUSPENDED_SEPARATE_CHANNEL"
            or not isinstance(feed.get("items"), list)):
        raise Refused("web feed lost its publication boundary")
    cache_bytes = read_file(repo / CACHE)
    cache_blob = hashlib.sha1(b"blob " + str(len(cache_bytes)).encode() + b"\0" + cache_bytes).hexdigest()
    return {"cache_sha256": digest(cache_bytes), "cache_git_blob": cache_blob,
            "cache_synced_at": cache.get("syncedAt"),
            "feed_sha256": digest(feed_bytes), "feed_bytes": len(feed_bytes),
            "item_count": len(feed["items"]), "channel_states": statuses,
            "degraded": "cached" in statuses.values()}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise Refused("public proof redirected away from the exact origin")


def fetch_public(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"Accept": "application/json",
        "Cache-Control": "no-cache", "User-Agent": "myquant-editorial-sync/1.0"})
    with urllib.request.build_opener(NoRedirect()).open(request, timeout=20) as response:
        if response.status != 200 or response.headers.get_content_type() not in {"application/json", "application/feed+json"}:
            raise Refused("public proof did not return JSON HTTP 200")
        body = response.read(MAX_FILE + 1)
        if len(body) > MAX_FILE:
            raise Refused("public proof exceeded its byte limit")
        return body


def publication_proof(cfg: Config, expected_sha: str, expected: dict,
                      fetch=fetch_public, sleep=time.sleep, monotonic=time.monotonic) -> dict:
    deadline = monotonic() + cfg.publication_timeout
    attempts = 0
    while True:
        attempts += 1
        try:
            first = json.loads(fetch(cfg.origin + "/api/v1/health"))
            feed = fetch(cfg.origin + "/feed.json")
            app = json.loads(fetch(cfg.origin + "/app-feed/v1.json"))
            last = json.loads(fetch(cfg.origin + "/api/v1/health"))
            if (first.get("data", {}).get("ok") is True and last.get("data", {}).get("ok") is True
                    and first.get("data", {}).get("source_sha") == expected_sha
                    and last.get("data", {}).get("source_sha") == expected_sha
                    and digest(feed) == expected["feed_sha256"]
                    and app.get("releaseStatus") == "SUSPENDED" and app.get("stories") == []):
                return {"status": "PASS", "source_sha": expected_sha,
                        "feed_sha256": digest(feed), "app_status": "SUSPENDED",
                        "checked_at": utc(), "attempts": attempts}
        except Exception:
            # Never persist a foreign upstream body, token or exception text.
            pass
        if monotonic() >= deadline:
            raise Refused("public source/feed/app proof did not converge before its deadline")
        sleep(min(cfg.retry_seconds, max(0, deadline - monotonic())))


def remote_head(repo: Path, runner: Runner) -> str:
    value = runner.git(repo, "ls-remote", "--exit-code", "origin", "refs/heads/main", name="remote-head")
    match = re.fullmatch(r"([0-9a-f]{40})\s+refs/heads/main", value)
    if not match:
        raise Refused("remote main did not resolve to one exact commit")
    return match.group(1)


def validate_first_success(state: Path) -> None:
    path = state / "first-success.json"
    if not os.path.lexists(path):
        return
    private_file(path)
    first = document(path)
    run_id = first.get("run_id", "")
    if (first.get("schema") != "myquant.editorial-sync.v1" or first.get("status") != "success"
            or first.get("publication", {}).get("status") != "PASS"
            or not re.fullmatch(r"\d{8}T\d{6}Z-[0-9a-f]{32}", run_id)
            or read_file(state / "receipts" / (run_id + "-result.json")) != read_file(path)):
        raise Refused("first-success evidence is not an intact prior result")


def execute(cfg: Config, *, publish: bool = False, runner: Runner | None = None,
            proof=publication_proof) -> dict:
    runner = runner or Runner(cfg)
    with locked(cfg.state):
        receipts = cfg.state / "receipts"
        private_dir(receipts)
        validate_first_success(cfg.state)
        run_id = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ-") + uuid.uuid4().hex
        receipt = {"schema": "myquant.editorial-sync.v1", "run_id": run_id,
                   "started_at": utc(), "controller_sha256": digest(read_file(Path(__file__))),
                   "publish_requested": publish, "repository": cfg.repository,
                   "status": "started", "steps": runner.steps}
        exclusive_json(receipts / (run_id + "-started.json"), receipt)
        try:
            with tempfile.TemporaryDirectory(prefix="candidate-", dir=cfg.state) as temp:
                repo = Path(temp) / "source"
                runner.run("clone", ["git", "clone", "--depth", "1", "--single-branch", "--branch", "main",
                                      "--no-tags", cfg.repository, str(repo)])
                head = runner.git(repo, "rev-parse", "HEAD")
                if not re.fullmatch(r"[0-9a-f]{40}", head) or remote_head(repo, runner) != head:
                    raise Refused("main changed while the candidate was cloned")
                receipt["input_head"] = head
                receipt["input_cache_sha256"] = digest(read_file(repo / CACHE))
                assert_repository_policy(repo, runner)
                runner.run("test", [cfg.npm, "test"], repo)
                runner.run("sync", [cfg.npm, "run", "sync"], repo)
                runner.run("verify", [cfg.npm, "run", "verify"], repo)
                runner.run("api-reader", [cfg.node, "--input-type=module", "-e",
                    "import {readFile} from 'node:fs/promises';"
                    "import {createEditorialFeedReader} from './api/lib/product-surface.mjs';"
                    "const body=await readFile('dist/feed.json');"
                    "const reader=createEditorialFeedReader({fetchImpl:async()=>new Response(body,"
                    "{headers:{'content-type':'application/feed+json'}})});"
                    "await reader.latestStories({limit:1});"], repo)
                changed = assert_cache_only(repo, runner)
                expected = artifact_proof(repo)
                receipt.update(expected)
                receipt["changed"] = changed
                if runner.git(repo, "rev-parse", "HEAD") != head or remote_head(repo, runner) != head:
                    raise Refused("candidate or remote main changed during verification")
                target = head
                if publish and changed:
                    runner.git(repo, "add", "--", CACHE, name="stage-cache")
                    if runner.git(repo, "diff", "--cached", "--name-only").splitlines() != [CACHE]:
                        raise Refused("staged change is not exactly the cache")
                    runner.git(repo, "-c", "user.name=myquant-wire", "-c",
                               "user.email=wire@myquantdoesntspeakenglish.com", "-c", "commit.gpgSign=false",
                               "commit", "-m", "content: refresh editorial network " + utc(), name="commit-cache")
                    target = runner.git(repo, "rev-parse", "HEAD")
                    if runner.git(repo, "rev-parse", "HEAD^") != head:
                        raise Refused("cache commit is not a direct child of the verified input")
                    if runner.git(repo, "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD").splitlines() != [CACHE]:
                        raise Refused("commit contains a path other than the cache")
                    if digest(read_file(repo / CACHE)) != expected["cache_sha256"]:
                        raise Refused("cache changed after verification")
                    if runner.git(repo, "rev-parse", "HEAD:" + CACHE) != expected["cache_git_blob"]:
                        raise Refused("committed cache bytes differ from verified bytes")
                    receipt.update({"target_head": target, "status": "push-prepared"})
                    exclusive_json(receipts / (run_id + "-push-prepared.json"), receipt)
                    if remote_head(repo, runner) != head:
                        raise Refused("remote main advanced before push")
                    runner.git(repo, "push", "origin", "HEAD:refs/heads/main", name="push-cache")
                    if remote_head(repo, runner) != target:
                        raise Refused("remote main changed after push; no rollback attempted")
                    receipt["status"] = "push-confirmed"
                    exclusive_json(receipts / (run_id + "-push-confirmed.json"), receipt)
                receipt["target_head"] = target
                if not changed and runner.git(repo, "rev-parse", "HEAD:" + CACHE) != expected["cache_git_blob"]:
                    raise Refused("unchanged cache does not match the selected source")
                if not publish:
                    receipt["status"] = "dry-run"
                    # A changed dry-run has no selected public SHA; do not
                    # claim its candidate bytes have been deployed.
                    if not changed:
                        receipt["publication"] = proof(cfg, target, expected)
                else:
                    receipt["publication"] = proof(cfg, target, expected)
                    receipt["status"] = "degraded" if expected["degraded"] else "success"
                receipt["finished_at"] = utc()
                exclusive_json(receipts / (run_id + "-result.json"), receipt)
                if receipt["status"] == "success":
                    try:
                        exclusive_json(cfg.state / "first-success.json", receipt)
                    except FileExistsError:
                        validate_first_success(cfg.state)
                return receipt
        except Exception as exc:
            receipt.update({"status": "failed", "finished_at": utc(),
                            "failure": str(exc) if isinstance(exc, Refused) else type(exc).__name__})
            exclusive_json(receipts / (run_id + "-failure.json"), receipt)
            raise Refused(receipt["failure"]) from None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--publish", action="store_true")
    args = parser.parse_args()
    try:
        receipt = execute(load_config(args.config), publish=args.publish)
    except Busy:
        print("myquant editorial sync: another run is active")
        return 0
    except Exception as exc:
        print("myquant editorial sync: " + (str(exc) if isinstance(exc, Refused) else type(exc).__name__))
        return 1
    print(json.dumps({k: receipt.get(k) for k in (
        "run_id", "status", "input_head", "target_head", "changed", "item_count", "degraded")}))
    return 1 if receipt.get("status") == "degraded" else 0


if __name__ == "__main__":
    raise SystemExit(main())
