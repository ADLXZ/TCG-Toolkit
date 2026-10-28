"""Build a public-only Pages artifact into a new directory."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
from urllib.parse import urlsplit

# GitHub Pages serves every file with max-age=600, and a hard reload does not cover
# modules imported later (auth.js loads app.js after sign-in). Stamping every local
# reference with a content hash gives each release fresh URLs. All references must
# carry the same stamp, or the browser would load a module twice and split its state.
HTML_REF = re.compile(r'((?:src|href)=")\./([\w.-]+\.(?:js|css))(")')
JS_REF = re.compile(r"""((?:\bfrom\s+|\bimport\s*\(\s*)(['"]))\./([\w.-]+\.js)(\2)""")


def stamp(output):
    files = sorted(p for p in output.iterdir() if p.suffix in {".html", ".js", ".css"})
    digest = hashlib.sha256()
    for path in files:
        digest.update(path.name.encode() + b"\0" + path.read_bytes())
    version = digest.hexdigest()[:12]
    for path in files:
        text = path.read_text(encoding="utf-8")
        if path.suffix == ".html":
            text = HTML_REF.sub(lambda m: f"{m[1]}./{m[2]}?v={version}{m[3]}", text)
        elif path.suffix == ".js":
            text = JS_REF.sub(lambda m: f"{m[1]}./{m[3]}?v={version}{m[4]}", text)
        path.write_text(text, encoding="utf-8", newline="\n")
    return version


def build(output, api):
    url = urlsplit(api)
    if url.scheme != "https" or not url.hostname or url.path not in ("", "/") or url.query or url.fragment or url.username:
        raise ValueError("API_BASE_URL must be an HTTPS origin")
    output.mkdir(parents=True, exist_ok=False)
    for source in Path("src/tcg_toolkit/static").iterdir():
        if source.is_file() and source.suffix in {".html", ".js", ".css"}:
            shutil.copy2(source, output / source.name)
    (output / "api-config.js").write_text("export const API_BASE_URL = " + json.dumps(api.rstrip("/")) + ";\n")
    version = stamp(output)
    (output / ".nojekyll").touch()
    return version


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--api", required=True)
    args = parser.parse_args()
    print("version", build(args.output, args.api))
