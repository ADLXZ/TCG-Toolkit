import importlib.util
import json
import sqlite3
import sys
import types
from pathlib import Path
import pytest


@pytest.mark.parametrize("failure,new_schema,rollback", [(False,2,False),(True,2,True),(True,3,False)])
def test_deploy_backup_and_recovery(tmp_path, monkeypatch, failure, new_schema, rollback):
    # Windows test host has no fcntl; Linux production uses a real advisory lock.
    if sys.platform == "win32":
        monkeypatch.setitem(sys.modules, "fcntl", types.SimpleNamespace(flock=lambda *a: None, LOCK_EX=2))
    spec = importlib.util.spec_from_file_location("deploy", "deploy/deploy.py")
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    old = {"image":"ghcr.io/test/app@sha256:"+"1"*64, "sha":"1"*40,
           "directory":str(tmp_path / "old"), "schema":2}
    (tmp_path / "current.json").write_text(json.dumps(old))
    calls = []
    def fake_run(*args, **kwargs):
        calls.append(args)
        if "config" in args:
            return json.dumps({"services":{"web":{"environment":{"API_DOMAIN":"api.example.com"}}}})
        if "cp" in args:
            destination = Path(args[-1]) / "data"; destination.mkdir()
            version = new_schema if destination.parent.name == "failed" else 2
            with sqlite3.connect(destination / "users.sqlite3") as db:
                db.execute(f"PRAGMA user_version = {version}")
        if "exec" in args:
            return str(new_schema)
        return ""
    def probe(api, sha):
        if failure and sha != old["sha"]:
            raise RuntimeError("health failed")
    monkeypatch.setattr(module, "run", fake_run)
    monkeypatch.setattr(module, "probe", probe)
    monkeypatch.setattr(module.time, "sleep", lambda _: None)
    monkeypatch.setattr(sys, "argv", ["deploy.py",str(tmp_path),"ghcr.io/test/app@sha256:"+"2"*64,"2"*40])
    if failure:
        with pytest.raises(RuntimeError): module.main()
        assert json.loads((tmp_path / "current.json").read_text()) == old
    else:
        module.main()
        assert json.loads((tmp_path / "previous.json").read_text()) == old
        assert json.loads((tmp_path / "current.json").read_text())["sha"] == "2"*40
    assert any("cp" in call for call in calls)
    assert any("up" in call and str(tmp_path / "old" / "compose.yaml") in call for call in calls) == rollback
    assert all("down" not in call for call in calls)
