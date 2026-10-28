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
