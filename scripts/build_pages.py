"""Build a public-only Pages artifact into a new directory."""
import argparse
import json
from pathlib import Path
import shutil
from urllib.parse import urlsplit


def build(output, api):
    url = urlsplit(api)
    if url.scheme != "https" or not url.hostname or url.path not in ("", "/") or url.query or url.fragment or url.username:
        raise ValueError("API_BASE_URL must be an HTTPS origin")
    output.mkdir(parents=True, exist_ok=False)
    for source in Path("src/tcg_toolkit/static").iterdir():
        if source.is_file() and source.suffix in {".html", ".js", ".css"}:
            shutil.copy2(source, output / source.name)
    (output / "api-config.js").write_text("export const API_BASE_URL = " + json.dumps(api.rstrip("/")) + ";\n")
    (output / ".nojekyll").touch()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--api", required=True)
    args = parser.parse_args()
    build(args.output, args.api)
