"""全局 httpx 异步连接池 — 复用 TCP 连接"""
import httpx

_client: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    """懒初始化全局连接池，max_connections=50"""
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            timeout=180,
            limits=httpx.Limits(
                max_connections=50,
                max_keepalive_connections=20,
                keepalive_expiry=30,
            ),
            follow_redirects=True,
        )
    return _client


async def close_http_client():
    """关闭全局连接池，应在应用关闭时调用"""
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
        _client = None
