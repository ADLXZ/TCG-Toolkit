import json
from pathlib import Path

import httpx
import pytest
from bs4 import BeautifulSoup

from tcg_toolkit import (
    ChaosTCGSearcher, Game, LyceeSearcher, SearchPaginationError,
    SearchParseError, SearchRequestError, StockStatus, WSRSearcher,
)


def fixture(name):
    return (Path(__file__).parent / "fixtures" / f"{name}.html").read_text(encoding="utf-8")


def client_for(html, requests=None):
    def respond(request):
        if requests is not None:
            requests.append(request)
        return httpx.Response(200, text=html)
    return httpx.Client(transport=httpx.MockTransport(respond))


@pytest.mark.parametrize("cls,source,keyword,game,number,price,name", [
    (WSRSearcher, "wsr_1", "OS01", Game.WSR, "OS01/R01-023A", 548000,
     "きらめく夏の一頁(直筆サイン入り/シリアルナンバー付き)"),
    (LyceeSearcher, "lo_1", "LO", Game.LYCEE, "LO-1315-X", 69800,
     "ライダー/アルトリア・ペンドラゴン〔オルタ〕(箔押し)"),
    (ChaosTCGSearcher, "chaos_1", "YZ", Game.CHAOS, "YZ-001", 7980,
     "空の島の同人作家「シャーリィ・ウォリック」(サイン入り)"),
])
def test_real_item_fields(cls, source, keyword, game, number, price, name):
    requests = []
    with client_for(fixture(source), requests) as client, cls(client=client) as searcher:
        result = searcher.search_page(keyword)
    item = result.items[0]
    assert (item.game, item.card_number, item.price, item.name) == (game, number, price, name)
    assert item.currency == "JPY"
    assert item.product_url.startswith(f"https://yuyu-tei.jp/sell/{cls.search_path.split('/')[2]}/card/")
    assert item.stock_status == StockStatus.OUT_OF_STOCK
    assert item.stock_quantity == 0
    assert item.stock_text == "在庫 : ×"
    assert len(requests) == 1
    assert dict(requests[0].url.params) == {"search_word": keyword}
    data = json.loads(json.dumps(result.to_dict(), ensure_ascii=False))
    assert data["items"][0]["game"] == game.value
    assert data["items"][0]["stock_status"] == "out_of_stock"
    assert data["has_next"] == result.has_next


@pytest.mark.parametrize("text,status,quantity", [
    ("在庫 : 3 点", "in_stock", 3), ("在庫 : 0 点", "out_of_stock", 0),
    ("在庫 : ◯", "in_stock", None), ("在庫 : ×", "out_of_stock", 0),
    ("在庫 : 入荷待ち", "unknown", None), ("", "unknown", None),
])
def test_stock(text, status, quantity):
    with WSRSearcher() as searcher:
        assert searcher.parse_stock(text) == (status, quantity)


@pytest.mark.parametrize("source,cls,page,next_page", [
    ("wsr_1", WSRSearcher, 1, None), ("lo_1", LyceeSearcher, 1, 2),
    ("lo_2", LyceeSearcher, 2, 3), ("chaos_2", ChaosTCGSearcher, 2, None),
    ("empty", WSRSearcher, 1, None),
])
def test_page_navigation(source, cls, page, next_page):
    with client_for(fixture(source)) as client, cls(client=client) as searcher:
        result = searcher.search_page("query", page=page)
    assert result.page == page
    assert result.next_page == next_page
    assert result.has_next == (next_page is not None)
    assert bool(result.items) == (source != "empty")


def test_iteration_lazy_order_interval_and_preserves_duplicate_numbers(monkeypatch):
    calls, sleeps = [], []
    monkeypatch.setattr("tcg_toolkit.search.time.sleep", sleeps.append)
    def respond(request):
        page = int(request.url.params.get("page", "1"))
        calls.append(page)
        return httpx.Response(200, text=fixture(f"chaos_{page}"))
    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        searcher = ChaosTCGSearcher(client=client)
        pages = searcher.iter_pages("YZ")
        assert calls == []
        first = next(pages)
        assert calls == [1] and sleeps == []
        second = next(pages)
        assert calls == [1, 2] and sleeps == [1.0]
        assert list(pages) == []
        assert list(searcher.iter_results("YZ")) == first.items + second.items
        assert list(searcher.iter_pages("YZ", start_page=2)) == [second]

    soup = BeautifulSoup(fixture("wsr_1"), "html.parser")
    cards = soup.select(".card-product")
    cards[1].select_one("span.border").string = cards[0].select_one("span.border").text
    with client_for(str(soup)) as client, WSRSearcher(client=client) as searcher:
        items = list(searcher.iter_results("OS01"))
    assert len(items) == len(cards)
    assert items[0].card_number == items[1].card_number
    assert items[0].product_url != items[1].product_url


@pytest.mark.parametrize("keyword,page", [("", 1), ("  ", 1), (None, 1),
                                          ("x", 0), ("x", -1), ("x", 1.5), ("x", True)])
def test_invalid_inputs_do_not_request(keyword, page):
    calls = []
    with client_for("", calls) as client, WSRSearcher(client=client) as searcher:
        with pytest.raises(ValueError):
            searcher.search_page(keyword, page=page)
    assert calls == []


def test_keyword_encoding_timeout_and_client_ownership():
    calls = []
    client = client_for(fixture("wsr_1"), calls)
    with WSRSearcher(client=client, timeout=7) as searcher:
        result = searcher.search_page("  日文 & +  ")
    assert not client.is_closed
    client.close()
    assert result.keyword == "日文 & +"
    assert calls[0].url.params["search_word"] == result.keyword
    assert calls[0].extensions["timeout"]["read"] == 7
    with WSRSearcher() as owned:
        assert not owned._client.is_closed
    assert owned._client.is_closed


@pytest.mark.parametrize("failure", [403, 500, "timeout"])
def test_request_errors_include_context(failure):
    def respond(request):
        if failure == "timeout":
            raise httpx.ReadTimeout("timed out", request=request)
        return httpx.Response(failure)
    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        with pytest.raises(SearchRequestError) as caught:
            LyceeSearcher(client=client).search_page("LO", page=2)
    error = caught.value
    assert (error.game, error.keyword, error.page) == (Game.LYCEE, "LO", 2)
    assert "page=2" in error.url
    assert isinstance(error.__cause__, httpx.HTTPError)


@pytest.mark.parametrize("selector,replacement", [
    ("h4", ""), ("span.border", ""), ("strong", ""), ("strong", "1,2 円"),
])
def test_malformed_core_fields(selector, replacement):
    soup = BeautifulSoup(fixture("wsr_1"), "html.parser")
    soup.select_one(f".card-product {selector}").string = replacement
    with client_for(str(soup)) as client:
        with pytest.raises(SearchParseError, match="Item 1") as caught:
            WSRSearcher(client=client).search_page("OS01")
    assert (caught.value.game, caught.value.keyword, caught.value.page) == (Game.WSR, "OS01", 1)


@pytest.mark.parametrize("html", ["<html>blocked</html>", "<main><div class='cards-list'></div></main>"])
def test_unrecognized_page_is_not_empty_result(html):
    with client_for(html) as client:
        with pytest.raises(SearchParseError):
            WSRSearcher(client=client).search_page("x")


@pytest.mark.parametrize("mode", ["backward", "malformed", "wrong_active", "missing_next"])
def test_bad_pagination(mode):
    soup = BeautifulSoup(fixture("lo_1"), "html.parser")
    for pager in soup.select(".pagination"):
        link = pager.select_one('[aria-label="Next"]')
        if mode == "backward": link["href"] = "?page=1"
        if mode == "malformed": link["href"] = "?page=no"
        if mode == "wrong_active": pager.select_one('[aria-current="page"]').string = "2"
        if mode == "missing_next": link.decompose()
    with client_for(str(soup)) as client:
        with pytest.raises(SearchPaginationError):
            LyceeSearcher(client=client).search_page("LO")


def test_disabled_next_and_unconfirmed_page():
    soup = BeautifulSoup(fixture("lo_1"), "html.parser")
    for link in soup.select('[aria-label="Next"]'):
        link.parent["class"] = ["page-item", "disabled"]
    with client_for(str(soup)) as client:
        assert not LyceeSearcher(client=client).search_page("LO").has_next
    with client_for(fixture("wsr_1")) as client:
        with pytest.raises(SearchPaginationError):
            WSRSearcher(client=client).search_page("OS01", page=2)


def test_iteration_failure_does_not_report_completion():
    def respond(request):
        if "page" in request.url.params:
            return httpx.Response(503)
        return httpx.Response(200, text=fixture("chaos_1"))
    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        pages = ChaosTCGSearcher(client=client, page_interval=0).iter_pages("YZ")
        assert next(pages).items
        with pytest.raises(SearchRequestError) as caught:
            next(pages)
        assert caught.value.page == 2
