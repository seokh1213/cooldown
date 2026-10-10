"""Expose only the generated evaluation page and its status, through private ingress."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()

    class ReportHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            name = {"/": "index.html", "/index.html": "index.html", "/status.json": "status.json"}.get(urlsplit(self.path).path)
            path = args.directory / name if name else None
            if not path or not path.is_file():
                self.send_error(404, "Report unavailable")
                return
            content = path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8" if name.endswith("html") else "application/json")
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'")
            self.end_headers()
            self.wfile.write(content)

        def log_message(self, *args):
            return

    ThreadingHTTPServer(("0.0.0.0", args.port), ReportHandler).serve_forever()


if __name__ == "__main__":
    main()
