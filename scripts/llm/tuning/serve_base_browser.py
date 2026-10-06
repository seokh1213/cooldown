"""Serve only experiment model/assets and save browser results on loopback."""
from functools import partial
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
from pathlib import Path
import shutil
import subprocess
import sys
from artifact_io import atomic_json


def contained_file(directory, relative):
    directory = Path(directory).resolve(); relative = Path(relative)
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError("Unsafe browser asset path")
    file = (directory / relative).resolve()
    if not file.is_relative_to(directory): raise ValueError("Browser asset leaves allowed directory")
    return file


class Handler(BaseHTTPRequestHandler):
    def __init__(self, *args, root, assets, **kwargs):
        self.root = root; self.assets = assets
        super().__init__(*args, **kwargs)

    def log_message(self, *args):
        pass

    def headers_for(self, content_type, size):
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(size))
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/": file = Path(__file__).with_name("base-browser.html")
        elif path == "/tasks.json": file = self.root / "browser-tasks.json"
        elif path == "/browser-specs.json": file = self.root / "browser-specs.json"
        elif path.startswith("/models/"):
            relative = Path(path.removeprefix("/models/"))
            if ".." in relative.parts or not relative.name.endswith((".onnx", ".onnx_data")):
                self.send_error(404); return
            try: file = contained_file(self.root / "models", relative)
            except ValueError: self.send_error(404); return
        elif path.startswith("/tokenizer/"):
            relative = Path(path.removeprefix("/tokenizer/"))
            if ".." in relative.parts or relative.suffix != ".json": self.send_error(404); return
            try: file = contained_file(self.root / "browser-tokenizer", relative)
            except ValueError: self.send_error(404); return
        elif path.startswith("/ort/"):
            relative = Path(path.removeprefix("/ort/"))
            if len(relative.parts) != 1: self.send_error(404); return
            file = self.assets["ort"] / relative
        elif path == "/transformers.js": file = self.assets["transformers"]
        else: self.send_error(404); return
        if not file.is_file(): self.send_error(404); return
        content_type = "text/javascript" if file.suffix in {".js", ".mjs"} else mimetypes.guess_type(file.name)[0] or "application/octet-stream"
        self.send_response(200); self.headers_for(content_type, file.stat().st_size)
        with file.open("rb") as stream: shutil.copyfileobj(stream, self.wfile)

    def do_POST(self):
        if self.path != "/results": self.send_error(404); return
        length = int(self.headers.get("Content-Length", "0"))
        if length > 1024 * 1024: self.send_error(413); return
        result = json.loads(self.rfile.read(length))
        atomic_json(self.root / "results/browser-results.json", result)
        self.send_response(200); self.headers_for("application/json", 2); self.wfile.write(b"{}")


def serve(metadata):
    root = Path(metadata["work"])
    code = "const fs=require('fs'),p=require('path');const r=fs.realpathSync('node_modules/@huggingface/transformers');const o=require.resolve('onnxruntime-web/webgpu',{paths:[r]});console.log(JSON.stringify({ort:p.dirname(o),transformers:p.join(r,'dist/transformers.web.js')}))"
    assets = {key: Path(value) for key, value in json.loads(subprocess.check_output(["node", "-e", code], text=True)).items()}
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(Handler, root=root, assets=assets))
    atomic_json(root / "browser-server.json", {"port": server.server_port})
    server.serve_forever()


if __name__ == "__main__": serve(json.loads(Path(sys.argv[1]).read_text()))
