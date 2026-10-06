import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import colab_controller


class ControllerTest(unittest.TestCase):
    def test_cli_errors_do_not_expose_output(self):
        result = subprocess.CompletedProcess([], 1, "private-session", "invalid_grant private-token")
        with patch.object(colab_controller.subprocess, "run", return_value=result):
            with self.assertRaisesRegex(RuntimeError, "authentication requires renewal") as raised:
                colab_controller.cli(["sessions"])
        self.assertNotIn("private", str(raised.exception))

    def test_failed_smoke_releases_gpu_and_persists_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch("sys.argv", ["controller", "--workspace", directory, "--run", "test"]), \
                    patch.object(colab_controller, "cli", return_value="") as cli, \
                    patch.object(colab_controller, "run_smoke", side_effect=RuntimeError("failed")), \
                    patch.object(colab_controller.signal, "signal"):
                with self.assertRaises(SystemExit):
                    colab_controller.main()
            self.assertEqual(cli.call_args.args[0], ["stop", "-s", "cooldown-wukong-test"])
            state = json.loads((Path(directory) / "results/status.json").read_text())
            self.assertEqual(state["stages"][2]["status"], "failed")
            self.assertEqual(state["stages"][3]["status"], "complete")
            self.assertEqual(state["variants"], {})

    def test_cleanup_failure_is_visible_in_saved_status(self):
        def command(args, **kwargs):
            if args[0] == "stop":
                raise RuntimeError("cleanup failed")
            return ""

        with tempfile.TemporaryDirectory() as directory:
            with patch("sys.argv", ["controller", "--workspace", directory, "--run", "test"]), \
                    patch.object(colab_controller, "cli", side_effect=command), \
                    patch.object(colab_controller, "run_smoke", side_effect=RuntimeError("failed")), \
                    patch.object(colab_controller.signal, "signal"):
                with self.assertRaises(SystemExit):
                    colab_controller.main()
            state = json.loads((Path(directory) / "results/status.json").read_text())
            self.assertEqual(state["stages"][3]["status"], "failed")
            self.assertIn("GPU 반납", state["message"])


if __name__ == "__main__":
    unittest.main()
