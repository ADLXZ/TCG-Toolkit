from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

import tcg_toolkit.product_details as module
from tcg_toolkit.web import app

ORIGIN = 'https://testserver'
FIXTURE = (Path(__file__).parent / 'fixtures' / 'product_wsr.html').read_text(encoding='utf-8')


class FakeClient:
    calls = []
    reply = None

    def get(self, url, *, timeout):
        FakeClient.calls.append(url)
        if isinstance(FakeClient.reply, Exception):
            raise FakeClient.reply
        return httpx.Response(200, text=FakeClient.reply, request=httpx.Request('GET', url))

    def close(self):
        pass


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv('TCG_USER_DB', str(tmp_path / 'users.sqlite3'))
    monkeypatch.setenv('TCG_TRUSTED_ORIGINS', ORIGIN)
    monkeypatch.setattr(module, 'SearchProxyClient', FakeClient)
    monkeypatch.setattr(module, '_cache', {})
    FakeClient.calls, FakeClient.reply = [], FIXTURE
    with TestClient(app, base_url=ORIGIN, headers={'Origin': ORIGIN}) as client:
        response = client.post('/api/auth/register', json={
            'username': 'alice', 'password': 'password123', 'confirm_password': 'password123'})
        client.headers['Authorization'] = 'Bearer ' + response.json()['token']
        yield client


def test_product_details_from_page_and_cached(client):
    for _ in range(2):
        response = client.get('/api/yuyutei/product', params={'gid': 56, 'ver': 'OS01', 'cid': '10240'})
        assert response.status_code == 200
        assert response.json() == {'gid': 56, 'ver': 'OS01', 'cid': '10240',
                                   'card_number': 'OS01/R01-053SEC', 'rarity': 'SEC'}
    assert FakeClient.calls == ['https://yuyu-tei.jp/sell/wsr/card/OS01/10240']
    assert response.headers['cache-control'] == 'no-store'


def test_rarity_is_optional_but_number_is_required():
    assert module.parse_product(FIXTURE.replace('SEC 大人', '大人'))['rarity'] is None
    with pytest.raises(ValueError):
        module.parse_product('<main>moved</main>')


@pytest.mark.parametrize('params', [{'gid': 1, 'ver': 'OS01', 'cid': '1'}, {'gid': 56, 'ver': '../x', 'cid': '1'},
                                    {'gid': 56, 'ver': 'OS01', 'cid': '1/2'}, {'gid': 56, 'ver': 'OS01'}])
def test_invalid_identity_never_fetches(client, params):
    assert client.get('/api/yuyutei/product', params=params).status_code == 422
    assert FakeClient.calls == []


@pytest.mark.parametrize('reply,status', [(httpx.ReadTimeout('x'), 504), (httpx.ConnectError('x'), 502),
                                          ('<html>not a product</html>', 502)])
def test_upstream_failures_are_not_cached(client, reply, status):
    FakeClient.reply = reply
    params = {'gid': 56, 'ver': 'OS01', 'cid': '10240'}
    assert client.get('/api/yuyutei/product', params=params).status_code == status
    FakeClient.reply = FIXTURE
    assert client.get('/api/yuyutei/product', params=params).status_code == 200


def test_requires_sign_in(client):
    client.headers.pop('Authorization')
    assert client.get('/api/yuyutei/product', params={'gid': 56, 'ver': 'OS01', 'cid': '1'}).status_code == 401
