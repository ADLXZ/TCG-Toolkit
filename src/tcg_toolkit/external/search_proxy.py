"""HTML forwarding API used by default search clients (not an HTTP CONNECT proxy)."""
import os

import httpx

DEFAULT_SEARCH_PROXY_URL = "http://62.234.212.90:8080/proxy"


class SearchProxyClient:
    """Forward target URLs as an encoded query parameter; preserve HTTPX errors."""

    def __init__(self, *, transport=None):
        self.url = os.getenv("TCG_SEARCH_PROXY_URL", DEFAULT_SEARCH_PROXY_URL)
        self.client = httpx.Client(transport=transport, follow_redirects=True, trust_env=False)

    def get(self, url, *, timeout):
        if not self.url:
            return self.client.get(url, timeout=timeout)
        return self.client.get(self.url, params={"url": url}, timeout=timeout)

    def close(self):
        self.client.close()

    @property
    def is_closed(self):
        return self.client.is_closed
