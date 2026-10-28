"""Errors retain the query context, including failures during iteration."""

from .models import Game


class SearchError(Exception):
    def __init__(self, message: str, *, game: Game, keyword: str, page: int, url: str):
        self.game = game
        self.keyword = keyword
        self.page = page
        self.url = url
        super().__init__(f"{message} (game={game}, keyword={keyword!r}, page={page}, url={url})")


class SearchRequestError(SearchError):
    """The HTTP request failed."""


class SearchParseError(SearchError):
    """The response does not match the supported result structure."""


class SearchPaginationError(SearchParseError):
    """The response pagination would skip back or return the wrong page."""
