import httpx
from test_product_details import client, FakeClient
from tcg_toolkit.external.search_proxy import SearchProxyClient, direct_search


def test_online_hidden_and_direct_rejected(client, monkeypatch):
    monkeypatch.delenv('TCG_ALLOW_PROXY_SWITCH', raising=False)
    assert client.get('/api/yuyutei/proxy-config').json() == {'available': False}
    assert client.get('/api/health', headers={'X-TCG-Direct': '1'}).status_code == 403


def test_local_mode_is_request_scoped(client, monkeypatch):
    monkeypatch.setenv('TCG_ALLOW_PROXY_SWITCH', 'true')
    assert client.get('/api/yuyutei/proxy-config').json() == {'available': True}
    modes = []
    original = FakeClient.get
    def get(self, url, *, timeout):
        modes.append(direct_search.get())
        return original(self, url, timeout=timeout)
    monkeypatch.setattr(FakeClient, 'get', get)
    params = {'gid': 8, 'ver': 'yuzu5.0', 'cid': '1', 'stock': 'true'}
    assert client.get('/api/yuyutei/product', params=params, headers={'X-TCG-Direct':'1'}).status_code == 200
    assert client.get('/api/yuyutei/product', params=params).status_code == 200
    assert modes == [True, False]
    assert direct_search.get() is False


def test_proxy_client_direct_mode_and_default(monkeypatch):
    monkeypatch.setenv('TCG_SEARCH_PROXY_URL', 'https://proxy.example/proxy')
    calls = []
    transport = httpx.MockTransport(lambda req: (calls.append(str(req.url)) or httpx.Response(200)))
    for direct in [True, False]:
        token = direct_search.set(direct)
        try:
            c = SearchProxyClient(transport=transport)
            c.get('https://yuyu-tei.jp/sell/ws', timeout=1); c.close()
        finally:
            direct_search.reset(token)
    assert calls[0] == 'https://yuyu-tei.jp/sell/ws'
    assert calls[1].startswith('https://proxy.example/proxy?url=')
