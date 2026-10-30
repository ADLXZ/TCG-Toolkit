from pathlib import Path

import httpx
import pytest

from tcg_toolkit import WSSearcher, SearchRequestError
from tcg_toolkit.external import SearchProxyClient
from tcg_toolkit.external.search_proxy import DEFAULT_SEARCH_PROXY_URL


def test_default_search_client():
    with WSSearcher() as searcher:
        assert isinstance(searcher._client, SearchProxyClient)


def test_forward_encoded_url_preserves_search_context(monkeypatch):
    monkeypatch.delenv('TCG_SEARCH_PROXY_URL', raising=False)
    calls = []
    def respond(request):
        calls.append(request)
        return httpx.Response(200, text=(Path(__file__).parent / 'fixtures/empty.html').read_text(encoding='utf-8'))
    client = SearchProxyClient(transport=httpx.MockTransport(respond))
    try:
        with WSSearcher(client=client) as searcher:
            result = searcher.search_page('立希 & + ?')
        assert result.items == []
        assert str(calls[0].url).startswith(DEFAULT_SEARCH_PROXY_URL + '?')
        target = httpx.URL(calls[0].url.params['url'])
        assert target.host == 'yuyu-tei.jp'
        assert target.path == '/sell/ws/s/search'
        assert target.params['search_word'] == '立希 & + ?'
        assert calls[0].extensions['timeout']['read'] == 30
    finally:
        client.close()


@pytest.mark.parametrize('failure', [403, 502, 'timeout'])
def test_proxy_failures_do_not_fall_back(failure):
    calls = []
    def respond(request):
        calls.append(request)
        if failure == 'timeout':
            raise httpx.ReadTimeout('Proxy timed out', request=request)
        return httpx.Response(failure)
    client = SearchProxyClient(transport=httpx.MockTransport(respond))
    try:
        with WSSearcher(client=client) as searcher, pytest.raises(SearchRequestError) as error:
            searcher.search_page('立希', page=2)
        assert len(calls) == 1
        assert error.value.url.startswith('https://yuyu-tei.jp/sell/ws/s/search?')
        assert httpx.URL(error.value.url).params['page'] == '2'
        assert isinstance(error.value.__cause__, httpx.HTTPError)
    finally:
        client.close()


@pytest.mark.parametrize('endpoint', ['', 'http://relay.example/proxy'])
def test_endpoint_configuration(monkeypatch, endpoint):
    monkeypatch.setenv('TCG_SEARCH_PROXY_URL', endpoint)
    calls = []
    client = SearchProxyClient(transport=httpx.MockTransport(lambda request: (calls.append(request), httpx.Response(200))[1]))
    try:
        client.get('https://yuyu-tei.jp/', timeout=5)
        assert str(calls[0].url).startswith(endpoint or 'https://yuyu-tei.jp/')
    finally:
        client.close()


@pytest.mark.parametrize('direct', [False, True])
def test_cart_proxy_method_headers_body_and_session_cookie(monkeypatch, direct):
    from tcg_toolkit.external.search_proxy import direct_search
    from tcg_toolkit.yuyutei_cart import cart_session, cart_request, CART_PAGE, CART_URL
    monkeypatch.setenv('TCG_SEARCH_PROXY_URL', 'http://relay.example/proxy')
    calls = []
    def handle(self, request):
        calls.append(request)
        target = str(request.url) if direct else request.url.params['url']
        assert target == (CART_PAGE if len(calls) == 1 else CART_URL)
        assert request.url.host == ('yuyu-tei.jp' if direct else 'relay.example')
        if len(calls) == 1:
            assert request.headers['cookie'] == 'laravel_session=original'
            return httpx.Response(200, headers={'set-cookie': 'laravel_session=rotated; Path=/; Secure; HttpOnly'})
        assert request.headers['cookie'] == 'laravel_session=rotated'
        assert request.headers['x-csrf-token'] == 'test-csrf'
        assert request.headers['referer'] == CART_PAGE
        assert request.method == 'POST' and request.content == b'counter=1'
        return httpx.Response(200, text='ok')
    monkeypatch.setattr(httpx.HTTPTransport, 'handle_request', handle)
    token = direct_search.set(direct)
    try:
        with cart_session('original', 'test-csrf') as client:
            cart_request(client, 'GET', CART_PAGE)
            cart_request(client, 'POST', CART_URL, data={'counter': 1},
                         headers={'x-csrf-token': 'test-csrf', 'referer': CART_PAGE})
        assert len(calls) == 2
    finally:
        direct_search.reset(token)


@pytest.mark.parametrize('status', [302, 403, 502])
def test_cart_proxy_failure_never_retries_or_redirects(monkeypatch, status):
    from fastapi import HTTPException
    from tcg_toolkit.yuyutei_cart import cart_session, cart_request, CART_URL
    monkeypatch.setenv('TCG_SEARCH_PROXY_URL', 'http://relay.example/proxy')
    calls = []
    def handle(self, request):
        calls.append(request)
        assert request.url.host == 'relay.example'
        return httpx.Response(status, headers={'location': 'https://yuyu-tei.jp/member/login'})
    monkeypatch.setattr(httpx.HTTPTransport, 'handle_request', handle)
    with cart_session('original', 'test-csrf') as client, pytest.raises(HTTPException):
        cart_request(client, 'POST', CART_URL, data={'counter': 1})
    assert len(calls) == 1


def test_search_redirect_stays_on_proxy(monkeypatch):
    monkeypatch.setenv('TCG_SEARCH_PROXY_URL', 'http://relay.example/proxy')
    calls = []
    def respond(request):
        calls.append(request)
        assert request.url.host == 'relay.example'
        if len(calls) == 1:
            return httpx.Response(302, headers={'location': 'https://yuyu-tei.jp/sell/ws/s/search?search_word=x'})
        return httpx.Response(200, text='ok')
    client = SearchProxyClient(transport=httpx.MockTransport(respond))
    try:
        assert client.get('https://yuyu-tei.jp/', timeout=5).text == 'ok'
        assert len(calls) == 2
    finally:
        client.close()
