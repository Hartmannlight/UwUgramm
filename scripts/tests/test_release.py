"""Release failure cases must prevent publication or tag promotion."""

import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("release", Path(__file__).parents[1] / "release.py")
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        previous = Path.cwd()
        os.chdir(self.temporary.name)
        self.addCleanup(os.chdir, previous)
        self.environment = patch.dict(
            os.environ,
            {
                "IMAGE": "ghcr.io/hartmannlight/uwugramm-api",
                "SERVICE": "api",
                "ARCH": "amd64",
                "GITHUB_SHA": "a" * 40,
                "GITHUB_RUN_ID": "42",
                "GITHUB_RUN_ATTEMPT": "1",
                "GITHUB_REF": "refs/heads/main",
                "GITHUB_STEP_SUMMARY": "summary.md",
                "GITHUB_OUTPUT": "output.txt",
            },
        )
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def invoke(self, mode):
        with patch("sys.argv", ["release.py", mode]):
            release.main()

    def test_pull_request_cannot_publish(self):
        with (
            patch.dict(os.environ, {"GITHUB_REF": "refs/pull/42/merge"}),
            patch.object(release, "run") as run,
        ):
            with self.assertRaisesRegex(RuntimeError, "restricted"):
                self.invoke("platform")
            run.assert_not_called()

    def test_only_exact_semver_tags_publish(self):
        with patch.dict(os.environ, {"GITHUB_REF": "refs/tags/v1.2.3-rc1"}):
            with self.assertRaisesRegex(RuntimeError, "restricted"):
                self.invoke("merge")

    def test_missing_architecture_cannot_merge(self):
        Path("metadata").mkdir()
        Path("metadata/amd64.json").write_text(json.dumps({"arch": "amd64", "reference": "irrelevant"}))
        with patch.object(release, "run") as run:
            with self.assertRaisesRegex(RuntimeError, "Both platform"):
                self.invoke("merge")
            run.assert_not_called()

    def test_foreign_image_cannot_merge(self):
        Path("metadata").mkdir()
        for arch in ("amd64", "arm64"):
            Path(f"metadata/{arch}.json").write_text(
                json.dumps(
                    {
                        "arch": arch,
                        "reference": "ghcr.io/other/image@sha256:" + "a" * 64,
                    }
                )
            )
        with patch.object(release, "run") as run:
            with self.assertRaisesRegex(RuntimeError, "Invalid platform"):
                self.invoke("merge")
            run.assert_not_called()

    def test_invalid_digest_cannot_promote(self):
        with (
            patch.dict(os.environ, {"DIGEST": "latest"}),
            patch.object(release, "run") as run,
        ):
            with self.assertRaisesRegex(RuntimeError, "Invalid validated"):
                self.invoke("promote")
            run.assert_not_called()

    def test_newer_main_is_not_overwritten(self):
        with (
            patch.dict(os.environ, {"DIGEST": "sha256:" + "b" * 64}),
            patch.object(release, "run", return_value="c" * 40 + "\trefs/heads/main") as run,
        ):
            self.invoke("promote")
            run.assert_called_once_with("git", "ls-remote", "origin", "refs/heads/main")

    def test_existing_immutable_tag_is_not_overwritten(self):
        with patch.object(release.subprocess, "run") as run:
            run.return_value.returncode = 0
            with self.assertRaisesRegex(RuntimeError, "Refusing to overwrite"):
                release.absent("ghcr.io/hartmannlight/uwugramm-api:v1.2.3")

    def test_registry_failure_is_not_treated_as_missing(self):
        with patch.object(release.subprocess, "run") as run:
            run.return_value.returncode = 1
            run.return_value.stdout = ""
            run.return_value.stderr = "unauthorized"
            with self.assertRaisesRegex(RuntimeError, "Cannot establish"):
                release.absent("ghcr.io/hartmannlight/uwugramm-api:v1.2.3")


if __name__ == "__main__":
    unittest.main()
