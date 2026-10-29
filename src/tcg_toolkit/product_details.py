"""Card number and rarity of a YuYu-Tei product, read from its public product page.

The cart page lists products without these, so the cart UI looks them up here.
No shop credentials are involved; pages are fetched like search pages.
"""
import re
from threading import Lock
from typing import Annotated

import httpx
from bs4 import BeautifulSoup
from fastapi import APIRouter, Depends, HTTPException, Query

from .auth.routes import current_user
from .external.search_proxy import SearchProxyClient

router = APIRouter(prefix='/api/yuyutei', dependencies=[Depends(current_user)])
GAME_PATHS = {7: 'ws', 8: 'chaos', 11: 'pm', 34: 'lo', 56: 'wsr'}
RARITY = re.compile(r'[A-Za-z0-9+★☆/-]+')
CACHE_LIMIT = 2000
# Printed details never change for a product, so a process-wide cache is safe.
_cache = {}
_cache_lock = Lock()


def parse_product(html):
    soup = BeautifulSoup(html, 'html.parser')
    number = soup.select_one('#product-detail span.border')
    title = soup.select_one('#power h3')
    card_number = ' '.join(number.get_text(' ', strip=True).split()) if number else ''
    if not card_number:
        raise ValueError('Missing card number')
    rarity = None
    if title is not None:
        # The title reads "<rarity> <name>", followed by the kana reading after <br>.
        heading = next((text.strip() for text in title.find_all(string=True, recursive=False) if text.strip()), '')
        token = heading.split(maxsplit=1)[0] if heading else ''
        if RARITY.fullmatch(token):
            rarity = token
    return {'card_number': card_number, 'rarity': rarity}


def fetch_product(gid, ver, cid, client_factory=None):
    key = (gid, ver, cid)
    with _cache_lock:
        if key in _cache:
            return _cache[key]
    url = f'https://yuyu-tei.jp/sell/{GAME_PATHS[gid]}/card/{ver}/{cid}'
    client = (client_factory or SearchProxyClient)()
    try:
        response = client.get(url, timeout=20)
        response.raise_for_status()
    except httpx.TimeoutException:
        raise HTTPException(504, detail='product_timeout') from None
    except httpx.HTTPError:
        raise HTTPException(502, detail='product_unavailable') from None
    finally:
        client.close()
    try:
        details = parse_product(response.text)
    except ValueError:
        raise HTTPException(502, detail='product_unreadable') from None
    with _cache_lock:
        if len(_cache) >= CACHE_LIMIT:
            _cache.pop(next(iter(_cache)))
        _cache[key] = details
    return details


@router.get('/product')
def product(gid: Annotated[int, Query()], ver: Annotated[str, Query(min_length=1, max_length=64,
            pattern=r'^[A-Za-z0-9_-][A-Za-z0-9_.-]*$')], cid: Annotated[str, Query(min_length=1, max_length=32,
            pattern=r'^[0-9]+$')]):
    if gid not in GAME_PATHS:
        raise HTTPException(422, detail='invalid_product')
    return {'gid': gid, 'ver': ver, 'cid': cid, **fetch_product(gid, ver, cid)}
