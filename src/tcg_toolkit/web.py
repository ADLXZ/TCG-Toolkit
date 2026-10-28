"""Local browser API; the existing searchers own upstream parsing."""
from pathlib import Path
from typing import Annotated

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles

from . import (ChaosTCGSearcher, Game, LyceeSearcher, SearchParseError,
               SearchRequestError, WSRSearcher)

app = FastAPI(title="TCG Toolkit")
SEARCHERS = {Game.WSR: WSRSearcher, Game.LYCEE: LyceeSearcher, Game.CHAOS: ChaosTCGSearcher}


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/search")
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


app.mount("/", StaticFiles(directory=Path(__file__).parent / "static", html=True), name="frontend")
