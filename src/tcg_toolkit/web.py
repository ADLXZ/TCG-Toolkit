"""Local browser API; the existing searchers own upstream parsing."""
from contextlib import asynccontextmanager
from pathlib import Path
import os
from starlette.middleware.cors import CORSMiddleware
from typing import Annotated

import httpx
from fastapi import FastAPI, HTTPException, Query, Depends
from fastapi.staticfiles import StaticFiles

from . import (ChaosTCGSearcher, Game, LyceeSearcher, SearchParseError,
               SearchRequestError, WSRSearcher, WSSearcher, PMSearcher)
from .external import CurrencyClient, CurrencyConfigError, CurrencyRequestError, TargetCurrency

from .auth.routes import router as auth_router, current_user, initialize_auth
from .favorites import router as favorites_router


@asynccontextmanager
async def lifespan(app):
    initialize_auth(app)
    yield


class BrowserCORS:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        origins = getattr(scope["app"].state, "auth_origins", set())
        await CORSMiddleware(self.app, allow_origins=list(origins),
                             allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
                             allow_headers=["Authorization", "Content-Type"])(scope, receive, send)


app = FastAPI(title="TCG Toolkit", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(BrowserCORS)
app.include_router(auth_router)
app.include_router(favorites_router)
SEARCHERS = {Game.WSR: WSRSearcher, Game.LYCEE: LyceeSearcher, Game.CHAOS: ChaosTCGSearcher, Game.WS: WSSearcher, Game.PM: PMSearcher}


@app.middleware('http')
async def browser_cache_policy(request, call_next):
    response = await call_next(request)
    if request.url.path == '/api/favorites' or request.url.path.startswith('/api/favorites/'):
        response.headers['Cache-Control'] = 'no-store'
    elif not request.url.path.startswith('/api/'):
        # Static filenames are stable across releases; validate cached modules.
        response.headers['Cache-Control'] = 'no-cache'
    return response


@app.get("/api/version")
def version():
    return {"sha": os.getenv("TCG_BUILD_SHA", "local")}


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/search", dependencies=[Depends(current_user)])
def search(game: Game, keyword: Annotated[str, Query(min_length=1)],
           page: Annotated[int, Query(ge=1)] = 1):
    if not keyword.strip():
        raise HTTPException(422, detail={"type": "validation_error", "message": "Keyword must not be empty."})
    try:
        with SEARCHERS[game]() as searcher:
            result = searcher.search_page(keyword, page=page)
        return {**result.to_dict(), "game": game.value}
    except SearchRequestError as exc:
        timeout = isinstance(exc.__cause__, httpx.TimeoutException)
        raise HTTPException(504 if timeout else 502, detail={
            "type": type(exc).__name__,
            "message": "The source timed out." if timeout else "Could not retrieve results from the source.",
        }) from exc
    except SearchParseError as exc:
        raise HTTPException(502, detail={"type": type(exc).__name__,
                                         "message": "Could not read the source results."}) from exc


@app.get("/api/currency/convert", dependencies=[Depends(current_user)])
def convert_currency(to: TargetCurrency, amount: Annotated[float, Query(ge=0, allow_inf_nan=False)] = 1):
    try:
        with CurrencyClient() as currency:
            return currency.convert_jpy(amount, to)
    except CurrencyConfigError as exc:
        raise HTTPException(503, detail={"type": type(exc).__name__, "message": str(exc)}) from exc
    except CurrencyRequestError as exc:
        timeout = isinstance(exc.__cause__, httpx.TimeoutException)
        raise HTTPException(504 if timeout else 502, detail={
            "type": type(exc).__name__,
            "message": "The currency provider timed out." if timeout else "Could not retrieve the currency conversion.",
        }) from exc


app.mount("/", StaticFiles(directory=Path(__file__).parent / "static", html=True), name="frontend")
