"""Offline transactions against real temporary Git remotes; no production IO."""
import dataclasses
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("editorial_sync", Path(__file__).with_name("editorial_sync.py"))
sync = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = sync
SPEC.loader.exec_module(sync)


def git(cwd, *args):
    return subprocess.check_output(["git", "-c", "core.hooksPath=/dev/null",
        "-c", "user.name=Fixture", "-c", "user.email=test@example.invalid",
        "-c", "commit.gpgSign=false", *args], cwd=cwd, stderr=subprocess.DEVNULL,
        text=True).strip()


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value) + "\n")


def cache(revision=1, degraded=False):
    return {"schema": "mqdnse.feed-cache.v2", "syncedAt": "2026-09-14T06:00:00Z",
            "channels": {key: [{"revision": revision}] for key in sync.SOURCES},
            "channelStatuses": {key: {"state": "cached" if degraded else "live"}
                                for key in sync.SOURCES}, "feeds": {}, "statuses": {}}


def make_artifacts(repo, revision=2, degraded=False):
    write(repo / sync.CACHE, cache(revision, degraded))
    write(repo / "dist/feed.json", {"_mqdnse": {
        "appDistribution": "SUSPENDED_SEPARATE_CHANNEL"}, "items": [{"id": str(revision)}]})
    write(repo / "dist/app-feed/v1.json", {"schema": "mqdnse.app-feed.v1",
        "releaseStatus": "SUSPENDED", "stories": []})


class FixtureRunner(sync.Runner):
    def __init__(self, cfg, callback=None):
        super().__init__(cfg)
        self.callback = callback
        self.seen = []

    def run(self, name, args, cwd=None):
        self.seen.append((name, list(args)))
        if self.callback:
            self.callback(name, args, cwd)
        if name == "source-list":
            return json.dumps([{"id": k, "url": v} for k, v in sync.SOURCES.items()])
        if name in {"test", "sync", "verify", "api-reader"}:
            if name == "sync":
                make_artifacts(cwd)
            self.steps.append({"step": name, "returncode": 0})
            return ""
        return super().run(name, args, cwd)


class Transactions(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.seed = self.root / "seed"
        self.seed.mkdir()
        git(self.seed, "init", "-q", "--initial-branch=main")
        write(self.seed / sync.CACHE, cache())
        write(self.seed / "package.json", {"scripts": {
            "sync": "node scripts/build.mjs", "test": "node --test",
            "verify": "node scripts/verify-build.mjs"}})
        write(self.seed / "vercel.json", {"buildCommand": "MYQUANT_USE_REVIEWED_CACHE=1 npm run build"})
        write(self.seed / "data/release-policy.json", {"emergencyStop": False,
            "channels": {"site": {"mode": "SOURCE_PUBLISHED"}, "app-feed": {"mode": "SUSPENDED"}}})
        (self.seed / ".gitignore").write_text("dist/\nnode_modules/\n")
        git(self.seed, "add", ".")
        git(self.seed, "commit", "-qm", "base")
        self.base = git(self.seed, "rev-parse", "HEAD")
        self.remote = self.root / "remote.git"
        git(self.root, "clone", "-q", "--bare", str(self.seed), str(self.remote))
        self.cfg = sync.Config(self.root / "state", self.root / "key", self.root / "known_hosts",
                               repository=str(self.remote), publication_timeout=0)
        self.proofs = []

    def proof(self, cfg, sha, expected):
        self.assertEqual(sha, git(self.remote, "rev-parse", "main"))
        self.proofs.append((sha, expected))
        return {"status": "PASS", "source_sha": sha, "feed_sha256": expected["feed_sha256"]}

    def run_sync(self, runner=None, publish=True, proof=None):
        return sync.execute(self.cfg, publish=publish, runner=runner or FixtureRunner(self.cfg),
                            proof=proof or self.proof)

    def remote_commit(self):
        git(self.seed, "commit", "--allow-empty", "-qm", "concurrent author")
        git(self.seed, "push", str(self.remote), "HEAD:refs/heads/main")
        return git(self.seed, "rev-parse", "HEAD")

    def failures(self):
        return list((self.cfg.state / "receipts").glob("*-failure.json"))

    def test_publishes_only_cache_as_direct_child_and_preserves_first_success(self):
        runner = FixtureRunner(self.cfg)
        first = self.run_sync(runner)
        self.assertEqual(first["status"], "success")
        self.assertTrue(first["changed"])
        target = first["target_head"]
        self.assertEqual(git(self.remote, "rev-parse", target + "^"), self.base)
        self.assertEqual(git(self.remote, "diff-tree", "--no-commit-id", "--name-only", "-r", target), sync.CACHE)
        push = next(args for step, args in runner.seen if step == "push-cache")
        self.assertEqual(push[-3:], ["push", "origin", "HEAD:refs/heads/main"])
        self.assertFalse(any("force" in arg for arg in push))
        retained = (self.cfg.state / "first-success.json").read_bytes()
        second = self.run_sync()
        self.assertFalse(second["changed"])
        self.assertEqual(second["target_head"], target)
        self.assertEqual(len(self.proofs), 2)
        self.assertEqual((self.cfg.state / "first-success.json").read_bytes(), retained)
        self.assertEqual(first["cache_synced_at"], "2026-09-14T06:00:00Z")

    def test_dry_run_makes_no_commit_or_push_and_claims_no_candidate_publication(self):
        runner = FixtureRunner(self.cfg)
        result = self.run_sync(runner, publish=False)
        self.assertEqual(result["status"], "dry-run")
        self.assertNotIn("publication", result)
        self.assertEqual(git(self.remote, "rev-parse", "main"), self.base)
        self.assertFalse(any(name in {"commit-cache", "push-cache"} for name, _ in runner.seen))

    def test_changed_tracked_or_untracked_path_refuses_before_commit(self):
        for filename in ("package.json", "unexpected.txt"):
            with self.subTest(filename=filename):
                def corrupt(name, args, cwd):
                    if name == "verify":
                        (cwd / filename).write_text("foreign build change")
                with self.assertRaisesRegex(sync.Refused, "other than"):
                    self.run_sync(FixtureRunner(self.cfg, corrupt))
                self.assertEqual(git(self.remote, "rev-parse", "main"), self.base)
        self.assertEqual(len(self.failures()), 2)

    def test_app_activation_or_symlink_cache_refuses(self):
        for failure in ("app", "link"):
            with self.subTest(failure=failure):
                def corrupt(name, args, cwd):
                    if name == "verify" and failure == "app":
                        write(cwd / "dist/app-feed/v1.json", {"releaseStatus": "LIVE", "stories": [1]})
                    elif name == "verify":
                        body = (cwd / sync.CACHE).read_bytes()
                        (cwd / sync.CACHE).unlink()
                        (cwd / "dist/foreign.json").write_bytes(body)
                        (cwd / sync.CACHE).symlink_to("../dist/foreign.json")
                with self.assertRaises(sync.Refused):
                    self.run_sync(FixtureRunner(self.cfg, corrupt))
                self.assertEqual(git(self.remote, "rev-parse", "main"), self.base)

    def test_policy_change_refuses_before_any_sync(self):
        policy = self.seed / "data/release-policy.json"
        value = json.loads(policy.read_text())
        value["channels"]["app-feed"]["mode"] = "LIVE"
        write(policy, value)
        git(self.seed, "add", ".")
        git(self.seed, "commit", "-qm", "policy changed")
        git(self.seed, "push", str(self.remote), "HEAD:refs/heads/main")
        runner = FixtureRunner(self.cfg)
        with self.assertRaisesRegex(sync.Refused, "policy changed"):
            self.run_sync(runner)
        self.assertNotIn("sync", [name for name, _ in runner.seen])

    def test_failed_api_reader_prevents_oversized_or_invalid_feed_push(self):
        def fail(name, args, cwd):
            if name == "api-reader":
                raise sync.Refused("api-reader failed")
        with self.assertRaisesRegex(sync.Refused, "api-reader"):
            self.run_sync(FixtureRunner(self.cfg, fail))
        self.assertEqual(git(self.remote, "rev-parse", "main"), self.base)

    def test_concurrent_remote_push_rejects_without_force_or_lost_author_work(self):
        observed = []
        def race(name, args, cwd):
            if name == "push-cache":
                observed.append(self.remote_commit())
        with self.assertRaisesRegex(sync.Refused, "push-cache"):
            self.run_sync(FixtureRunner(self.cfg, race))
        self.assertEqual(git(self.remote, "rev-parse", "main"), observed[0])
        self.assertEqual(len(list((self.cfg.state / "receipts").glob("*-push-prepared.json"))), 1)

    def test_pushed_but_unproved_run_recovers_as_noop_without_rewriting_failure(self):
        def interrupted(*args):
            raise sync.Refused("public proof interrupted")
        with self.assertRaisesRegex(sync.Refused, "interrupted"):
            self.run_sync(proof=interrupted)
        first_failure = self.failures()[0].read_bytes()
        target = git(self.remote, "rev-parse", "main")
        self.assertNotEqual(target, self.base)
        self.assertFalse((self.cfg.state / "first-success.json").exists())
        recovered = self.run_sync()
        self.assertEqual(recovered["target_head"], target)
        self.assertFalse(recovered["changed"])
        self.assertEqual(self.failures()[0].read_bytes(), first_failure)

    def test_degraded_sources_are_explicit_and_not_first_healthy_receipt(self):
        def stale(name, args, cwd):
            if name == "verify":
                make_artifacts(cwd, degraded=True)
        result = self.run_sync(FixtureRunner(self.cfg, stale))
        self.assertEqual(result["status"], "degraded")
        self.assertEqual(result["publication"]["status"], "PASS")
        self.assertFalse((self.cfg.state / "first-success.json").exists())

    def test_lock_contention_does_not_clone_or_replace_lock(self):
        runner = FixtureRunner(self.cfg)
        with sync.locked(self.cfg.state):
            inode = (self.cfg.state / "sync.lock").stat().st_ino
            with self.assertRaises(sync.Busy):
                self.run_sync(runner)
        self.assertEqual(runner.seen, [])
        self.assertEqual((self.cfg.state / "sync.lock").stat().st_ino, inode)

    def test_foreign_lock_and_existing_receipts_are_preserved(self):
        sync.private_dir(self.cfg.state)
        foreign = self.root / "foreign"
        foreign.write_text("retain")
        (self.cfg.state / "sync.lock").symlink_to(foreign)
        with self.assertRaises(OSError):
            self.run_sync()
        self.assertEqual(foreign.read_text(), "retain")
        path = self.cfg.state / "retained.json"
        sync.exclusive_json(path, {"first": True})
        before = path.read_bytes()
        with self.assertRaises(FileExistsError):
            sync.exclusive_json(path, {"first": False})
        self.assertEqual(path.read_bytes(), before)

    def test_foreign_first_success_refuses_before_clone(self):
        sync.private_dir(self.cfg.state)
        path = self.cfg.state / "first-success.json"
        sync.exclusive_json(path, {"foreign": "preserve"})
        before = path.read_bytes()
        runner = FixtureRunner(self.cfg)
        with self.assertRaises(sync.Refused):
            self.run_sync(runner)
        self.assertEqual(runner.seen, [])
        self.assertEqual(path.read_bytes(), before)

    def test_command_deadline_and_error_logs_do_not_expose_child_output(self):
        runner = sync.Runner(dataclasses.replace(self.cfg, command_timeout=0.1))
        with self.assertRaisesRegex(sync.Refused, "deadline"):
            runner.run("bounded", [sys.executable, "-c", "import time;time.sleep(10)"])
        with self.assertRaisesRegex(sync.Refused, "redacted failed") as caught:
            runner.run("redacted", [sys.executable, "-c", "print('SECRET-fixture');raise SystemExit(1)"])
        self.assertNotIn("SECRET", str(caught.exception) + json.dumps(runner.steps))
        self.assertNotIn("MYQUANT_USE_REVIEWED_CACHE", runner.env)
        self.assertNotIn("SSH_AUTH_SOCK", runner.env)


class PublicProof(unittest.TestCase):
    def setUp(self):
        self.cfg = sync.Config(Path("/unused"), Path("/unused/key"), Path("/unused/hosts"), publication_timeout=0)
        self.sha = "a" * 40
        self.body = b'{"items":[]}'

    def fetch(self, url):
        if url.endswith("health"):
            return json.dumps({"data": {"ok": True, "source_sha": self.sha}}).encode()
        if url.endswith("v1.json"):
            return b'{"releaseStatus":"SUSPENDED","stories":[]}'
        return self.body

    def test_exact_source_bytes_and_empty_app_pass(self):
        result = sync.publication_proof(self.cfg, self.sha, {"feed_sha256": sync.digest(self.body)}, fetch=self.fetch)
        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["attempts"], 1)

    def test_wrong_source_bytes_app_and_midread_source_change_fail(self):
        for mode in ("source", "feed", "app", "midread"):
            count = []
            def fetch(url):
                count.append(url)
                if mode == "source" or (mode == "midread" and len(count) == 4):
                    if url.endswith("health"):
                        return b'{"data":{"source_sha":"old"}}'
                if mode == "feed" and url.endswith("feed.json"):
                    return b'{"items":[1]}'
                if mode == "app" and url.endswith("v1.json"):
                    return b'{"releaseStatus":"LIVE","stories":[1]}'
                return self.fetch(url)
            with self.subTest(mode=mode), self.assertRaises(sync.Refused):
                sync.publication_proof(self.cfg, self.sha, {"feed_sha256": sync.digest(self.body)}, fetch=fetch)


if __name__ == "__main__":
    unittest.main()
