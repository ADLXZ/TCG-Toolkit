"""JPY conversion through RapidAPI's Currency Conversion and Exchange Rates."""

import math
import os
import sqlite3
import time
from contextlib import closing
from enum import Enum
from pathlib import Path

import httpx
from dotenv import dotenv_values


class TargetCurrency(str, Enum):
    CNY = "CNY"
    CAD = "CAD"


class CurrencyConfigError(RuntimeError):
    """The RapidAPI key is missing."""


class CurrencyRequestError(RuntimeError):
    """The provider request failed or returned an invalid conversion."""


class CurrencyClient:
    host = "currency-conversion-and-exchange-rates.p.rapidapi.com"

    def __init__(self, *, api_key: str | None = None, client: httpx.Client | None = None,
                 timeout: float = 30.0, cache_path: str | Path | None = None):
        # Read the working directory's .env without modifying process variables.
        if api_key is None:
            api_key = os.environ.get("RAPIDAPI_KEY")
            if api_key is None:
                api_key = dotenv_values(Path.cwd() / ".env").get("RAPIDAPI_KEY")
        self._api_key = (api_key or "").strip()
        self.cache_path = Path(cache_path or os.environ.get("TCG_CURRENCY_CACHE", "data/currency.sqlite3"))
        self.timeout = timeout
        self._owns_client = client is None
        self._client = client if client is not None else httpx.Client()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()

    def close(self):
        if self._owns_client:
            self._client.close()

    def convert_jpy(self, amount: float, to: TargetCurrency | str) -> dict:
        """Convert JPY using persisted CNY/CAD rates, refreshed after 24 hours."""
        target = TargetCurrency(to)
        if isinstance(amount, bool) or not isinstance(amount, (int, float)) or not math.isfinite(amount) or amount < 0:
            raise ValueError("amount must be a finite, non-negative number")
        errors = {}
        try:
            self.cache_path.parent.mkdir(parents=True, exist_ok=True)
            with closing(sqlite3.connect(self.cache_path)) as db:
                db.execute("""CREATE TABLE IF NOT EXISTS rates (
                    currency TEXT PRIMARY KEY, rate REAL, fetched_at REAL, attempted_at REAL
                )""")
                for currency in TargetCurrency:
                    # Reserve and persist an attempt before doing network I/O. This
                    # survives failure/restart and serializes competing processes.
                    db.execute("BEGIN IMMEDIATE")
                    now = time.time()
                    row = db.execute("SELECT rate, fetched_at, attempted_at FROM rates WHERE currency = ?",
                                     (currency.value,)).fetchone()
                    if row and ((row[1] is not None and now - row[1] <= 86400)
                                or (row[2] is not None and now - row[2] <= 86400)):
                        db.commit()
                        continue
                    if not self._api_key:
                        db.commit()
                        errors[currency] = CurrencyConfigError("RAPIDAPI_KEY is not configured.")
                        continue
                    db.execute("""INSERT INTO rates (currency, attempted_at) VALUES (?, ?)
                        ON CONFLICT(currency) DO UPDATE SET attempted_at = excluded.attempted_at""",
                               (currency.value, now))
                    db.commit()
                    try:
                        rate = self._fetch_rate(currency)
                    except CurrencyRequestError as exc:
                        errors[currency] = exc
                        continue
                    db.execute("UPDATE rates SET rate = ?, fetched_at = ? WHERE currency = ?",
                               (rate, time.time(), currency.value))
                    db.commit()
                row = db.execute("SELECT rate, fetched_at FROM rates WHERE currency = ?",
                                 (target.value,)).fetchone()
        except (sqlite3.Error, OSError) as exc:
            raise CurrencyRequestError("Could not access the local currency cache.") from exc
        if row is None or row[1] is None or time.time() - row[1] > 86400:
            if target in errors:
                raise errors[target]
            raise CurrencyRequestError("No fresh rate available; the next attempt is allowed after 24 hours.")
        return {"from": "JPY", "to": target.value, "amount": amount, "result": amount * row[0]}

    def _fetch_rate(self, target: TargetCurrency) -> float:
        try:
            response = self._client.get(
                f"https://{self.host}/convert",
                params={"from": "JPY", "to": target.value, "amount": 1},
                headers={"x-rapidapi-host": self.host, "x-rapidapi-key": self._api_key},
                timeout=self.timeout,
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise CurrencyRequestError("Could not retrieve the currency conversion.") from exc
        try:
            data = response.json()
        except ValueError as exc:
            raise CurrencyRequestError("Invalid currency conversion response.") from exc
        if not isinstance(data, dict) or data.get("success") is False:
            raise CurrencyRequestError("Currency conversion was unsuccessful.")
        result = data.get("result")
        if isinstance(result, bool) or not isinstance(result, (int, float)) or not math.isfinite(result) or result <= 0:
            raise CurrencyRequestError("Invalid currency conversion result.")
        return result
