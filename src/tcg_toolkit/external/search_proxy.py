"""HTML forwarding API used by default search clients (not an HTTP CONNECT proxy)."""
import os
from contextvars import ContextVar

direct_search = ContextVar("direct_search", default=False)

import httpx

DEFAULT_SEARCH_PROXY_URL = "http://62.234.212.90:8080/proxy"


def proxy_url():
    return "" if direct_search.get() else os.getenv("TCG_SEARCH_PROXY_URL", DEFAULT_SEARCH_PROXY_URL)


class YuYuTeiProxyTransport(httpx.BaseTransport):
    """Relay on the wire while HTTPX keeps cookies scoped to the target host."""

    def __init__(self, *, transport=None):
        self.url = proxy_url()
        self.transport = transport if transport is not None else httpx.HTTPTransport()

    def handle_request(self, request):
        if not self.url or request.url.host != 'yuyu-tei.jp':
            return self.transport.handle_request(request)
        forwarded = httpx.Request(
            request.method, self.url, params={'url': str(request.url)},
            headers=[(key, value) for key, value in request.headers.raw if key.lower() != b'host'],
            content=request.read(), extensions=request.extensions,
        )
        return self.transport.handle_request(forwarded)

    def close(self):
        self.transport.close()


class SearchProxyClient:
    """Forward target URLs as an encoded query parameter; preserve HTTPX errors."""

    def __init__(self, *, transport=None):
        self.url = proxy_url()
        self.client = httpx.Client(transport=YuYuTeiProxyTransport(transport=transport),
                                   follow_redirects=True, trust_env=False)

    def get(self, url, *, timeout):
        return self.client.get(url, timeout=timeout)

    def close(self):
        self.client.close()

    @property
    def is_closed(self):
        return self.client.is_closed
