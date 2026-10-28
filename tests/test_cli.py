import json

import pytest

from tcg_toolkit import Game, SearchPage, SearchRequestError
from tcg_toolkit import cli


@pytest.fixture
def calls(monkeypatch):
    calls = []
    class Fake:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def search_page(self, keyword, *, page):
            calls.append((keyword, page))
            return SearchPage([], keyword, page, None)
        def iter_pages(self, keyword, *, start_page):
            yield self.search_page(keyword, page=start_page)
    for name in ("WSRSearcher", "LyceeSearcher", "ChaosTCGSearcher", "WSSearcher", "PMSearcher"):
        monkeypatch.setattr(cli, name, Fake)
    return calls


def test_multiple_games_json(calls, capsys):
    assert cli.main(["YZ", "-g", "wsr", "-g", "chaos", "-g", "wsr", "--page", "2"]) == 0
    rows = [json.loads(line) for line in capsys.readouterr().out.splitlines()]
    assert [row["game"] for row in rows] == ["wsr", "chaos"]
    assert calls == [("YZ", 2), ("YZ", 2)]


def test_clean_all_and_legacy(calls, capsys):
    assert cli.main(["wsr", "OS01", "--clean", "--all"]) == 0
    output = capsys.readouterr().out
    assert "wsr | 0 results" in output and "No results found." in output
    assert "page" not in output.lower() and "第" not in output
    assert calls == [("OS01", 1)]


def test_continue_after_error(calls, capsys, monkeypatch):
    class Broken:
        def __enter__(self):
            raise SearchRequestError("failed", game=Game.WSR, keyword="X", page=1, url="test")
        def __exit__(self, *args): pass
    monkeypatch.setattr(cli, "WSRSearcher", Broken)
    assert cli.main(["X", "-g", "wsr", "-g", "lycee"]) == 1
    output = capsys.readouterr()
    assert "搜索失败" in output.err
    assert json.loads(output.out)["game"] == "lycee"
    assert calls == [("X", 1)]


def test_table_real_items(capsys):
    from pathlib import Path
    from tcg_toolkit import WSRSearcher
    html = (Path(__file__).parent / "fixtures/wsr_1.html").read_text(encoding="utf-8")
    with WSRSearcher() as searcher:
        page = searcher.parse_page(html, keyword="OS01", page=1, url=searcher.base_url)
    cli.print_table("wsr", page)
    output = capsys.readouterr().out
    assert "OS01/R01-023A" in output and "548,000" in output
    assert "Out of stock (0)" in output and "Name" in output
    assert cli._width("中文AB") == 6


@pytest.mark.parametrize("game", ["ws", "pm"])
def test_new_games_legacy(game, calls, capsys):
    assert cli.main([game, "01", "--clean"]) == 0
    assert f"{game} | 0 results" in capsys.readouterr().out
    assert calls == [("01", 1)]


def test_new_games_combined(calls, capsys):
    assert cli.main(["01", "-g", "ws", "-g", "pm"]) == 0
    assert [json.loads(line)["game"] for line in capsys.readouterr().out.splitlines()] == ["ws", "pm"]
