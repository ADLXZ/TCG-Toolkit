import httpx
import pytest
from fastapi.testclient import TestClient

from tcg_toolkit import Game, SearchPage, SearchParseError, SearchRequestError
from tcg_toolkit.web import app, SEARCHERS

client = TestClient(app)


def test_static_and_health():
    assert client.get('/api/health').json() == {'status': 'ok'}
    assert 'data-i18n="tcg_toolkit_search"' in client.get('/').text
    assert 'TCG Toolkit' in client.get('/locales.js').text
    assert client.get('/i18n.js').status_code == 200
    assert client.get('/app.js').status_code == 200
    assert client.get('/theme.css').status_code == 200
    assert client.get('/style.css').status_code == 200


@pytest.mark.parametrize('game', list(Game))
def test_search(game, monkeypatch):
    class Fake:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def search_page(self, keyword, *, page):
            assert keyword == 'OS01' and page == 2
            return SearchPage([], keyword, page, 3)
    monkeypatch.setitem(SEARCHERS, game, Fake)
    result = client.get('/api/search', params={'game': game.value, 'keyword': 'OS01', 'page': 2})
    assert result.status_code == 200
    assert result.json() == dict(items=[], keyword='OS01', page=2, next_page=3, has_next=True, game=game.value)


@pytest.mark.parametrize('params', [dict(game='bad', keyword='x'), dict(game='wsr', keyword=' '),
                                    dict(game='wsr', keyword='x', page=0), dict(game='wsr')])
def test_validation(params):
    assert client.get('/api/search', params=params).status_code == 422


@pytest.mark.parametrize('kind,status', [('request', 502), ('timeout', 504), ('parse', 502)])
def test_errors(kind, status, monkeypatch):
    class Broken:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def search_page(self, *args, **kwargs):
            error = SearchParseError if kind == 'parse' else SearchRequestError
            cause = httpx.ReadTimeout('timeout') if kind == 'timeout' else None
            raise error('internal detail', game=Game.WSR, keyword='x', page=1, url='url') from cause
    monkeypatch.setitem(SEARCHERS, Game.WSR, Broken)
    response = client.get('/api/search', params={'game': 'wsr', 'keyword': 'x'})
    assert response.status_code == status
    assert 'message' in response.json()['detail']
    assert 'internal detail' not in response.text
