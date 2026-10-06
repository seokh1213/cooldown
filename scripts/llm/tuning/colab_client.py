"""Capture CLI output because it contains runtime identifiers and credentials."""
import json
from pathlib import Path
import subprocess


class ColabError(RuntimeError):
    pass


class Colab:
    def __init__(self, metadata):
        self.metadata = metadata
        self.name = metadata["session"]
        self.config = metadata["config"]

    def call(self, command, *arguments, timeout=600):
        try:
            result = subprocess.run(
                [str(Path.home() / ".local/share/uv/tools/google-colab-cli/bin/python"),
                 str(Path(__file__).with_name("colab_safe_cli.py")),
                 "--auth=oauth2", "--config", self.config, command,
                 "-s", self.name, *map(str, arguments)],
                capture_output=True, text=True, timeout=timeout,
            )
        except subprocess.TimeoutExpired:
            raise ColabError(f"{command}: timeout") from None
        if result.returncode:
            output = result.stdout + result.stderr
            categories = [name for name in ["CUDA", "ModuleNotFoundError", "TypeError",
                "ValueError", "AttributeError", "ReadWriteLock", "OutOfMemoryError",
                "FileNotFoundError", "ImportError", "NameError", "KeyError", "AssertionError",
                "SyntaxError", "UnicodeEncodeError", "DecodeError", "kernel", "429", "quota",
                "Session", "not found",
                "HTTP 403", "HTTP 500", "HTTP 503"] if name in output]
            raise ColabError(f"{command}: failed ({', '.join(categories) or 'runtime error'})")
        return result.stdout

    def execute(self, file, timeout=1800):
        return self.call("exec", "-f", file, "--timeout", timeout, timeout=timeout + 60)

    def upload(self, file, destination):
        from collect_checkpoints import transfer
        transfer(self.metadata, "upload", {"local": str(file), "remote": destination})

    def download(self, source, file):
        from collect_checkpoints import transfer
        transfer(self.metadata, "download", {"remote": source, "local": str(file)})


def active_run():
    root = Path(__file__).resolve().parents[3]
    return json.loads((root / "research/.cache/tuning/latest.json").read_text())
