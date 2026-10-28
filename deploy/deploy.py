"""Run on the VPS: python3 releases/SHA/deploy.py ROOT IMAGE SHA [--rollback]."""
import fcntl
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import time
import urllib.request
import urllib.error


def run(*args, **kwargs):
    return subprocess.check_output(args, text=True, **kwargs).strip()


def schema(folder):
    path = folder / "data" / "users.sqlite3"
    if not path.exists():
        return 0
    with sqlite3.connect(f"file:{path}?mode=ro", uri=True) as db:
        return db.execute("PRAGMA user_version").fetchone()[0]


def probe(api, sha):
    def request(path, method="GET", headers=None):
        req = urllib.request.Request(api + path, method=method, headers=headers or {})
        try:
            return urllib.request.urlopen(req, timeout=15)
        except urllib.error.HTTPError as error:
            return error
    with request("/api/version") as response:
        assert response.status == 200 and json.load(response) == {"sha": sha}
    with request("/api/health") as response:
        assert response.status == 200
    with request("/api/auth/me") as response:
        assert response.status == 401
    origin = "https://oscarzhang-735.github.io"
    with request("/api/auth/login", "OPTIONS", {"Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type"}) as response:
        assert response.status == 200 and response.headers.get("Access-Control-Allow-Origin") == origin


def main():
    root = Path(sys.argv[1]).resolve()
    root.mkdir(parents=True, exist_ok=True)
    lock = (root / "deploy.lock").open("a")
    fcntl.flock(lock, fcntl.LOCK_EX)
    state_file = root / "current.json"
    current = json.loads(state_file.read_text()) if state_file.exists() else None
    rollback = "--rollback" in sys.argv
    if rollback:
        target = json.loads((root / "previous.json").read_text())
    else:
        image, sha = sys.argv[2:4]
        assert re.fullmatch(r"ghcr.io/[a-z0-9._/-]+@sha256:[a-f0-9]{64}", image)
        assert re.fullmatch(r"[a-f0-9]{40}", sha)
        target = dict(image=image, sha=sha, directory=str(Path(__file__).resolve().parent))
    def compose(release, *args):
        env = {**os.environ, "TCG_IMAGE": release["image"]}
        return run("docker", "compose", "--env-file", str(root / ".env"), "-f",
                   str(Path(release["directory"]) / "compose.yaml"), *args, env=env)
    config = json.loads(compose(target, "config", "--format", "json"))
    domain = config["services"]["web"]["environment"]["API_DOMAIN"]
    assert re.fullmatch(r"[a-zA-Z0-9.-]+", domain)
    api = "https://" + domain
    compose(target, "pull")
    backup = root / "backups" / (str(time.time_ns()) + "-" + target["sha"])
    backup.mkdir(parents=True)
    before = 0
    if current:
        compose(current, "stop", "web")
        try:
            compose(current, "cp", "web:/app/data", str(backup))
            before = schema(backup)
            if rollback and target.get("schema") != before:
                raise RuntimeError("Schema differs: restore the matching backup manually before rollback")
        except Exception:
            compose(current, "start", "web")
            raise
    try:
        compose(target, "up", "-d", "--wait", "--wait-timeout", "120")
        for attempt in range(12):
            try:
                probe(api, target["sha"])
                break
            except Exception:
                if attempt == 11:
                    raise
                time.sleep(5)
        target["schema"] = int(compose(target, "exec", "-T", "web", "python", "-c",
            "import sqlite3; print(sqlite3.connect('/app/data/users.sqlite3').execute('PRAGMA user_version').fetchone()[0])"))
    except Exception:
        compose(target, "stop", "web")
        inspection = backup / "failed"
        inspection.mkdir()
        compose(target, "cp", "web:/app/data", str(inspection))
        if current and schema(inspection) == before:
            compose(current, "up", "-d", "--wait", "--wait-timeout", "120")
            probe(api, current["sha"])
        else:
            print("Automatic rollback unavailable: restore backup with its matching release:", backup, file=sys.stderr)
        raise
    if current and current["sha"] != target["sha"]:
        (root / "previous.json").write_text(json.dumps(current))
    temporary = root / "current.next.json"
    temporary.write_text(json.dumps(target))
    temporary.replace(state_file)
    print("Deployed", target["sha"], "backup:", backup)


if __name__ == "__main__":
    main()
