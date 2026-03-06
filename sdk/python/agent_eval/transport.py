"""传输层 - 异步 batch 上报到平台"""
import atexit
import json
import logging
import threading
import time
from typing import Any, Dict, List, Optional
from urllib.request import Request, urlopen
from urllib.error import URLError

logger = logging.getLogger("agent_eval.transport")


class BatchTransport:
    """
    异步 batch HTTP 传输。
    - 后台线程定时 flush（默认 5 秒）
    - 缓冲区达到阈值时立即 flush（默认 100 条）
    - 失败时指数退避重试（最多 3 次）
    - 所有异常静默捕获，不影响业务
    """

    def __init__(
        self,
        base_url: str,
        api_key: str,
        flush_interval: float = 5.0,
        max_batch_size: int = 100,
        max_retries: int = 3,
    ):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.flush_interval = flush_interval
        self.max_batch_size = max_batch_size
        self.max_retries = max_retries

        self._buffer: List[Dict[str, Any]] = []
        self._lock = threading.Lock()
        self._running = True

        # 后台 flush 线程
        self._thread = threading.Thread(target=self._flush_loop, daemon=True)
        self._thread.start()

        # 退出时最后 flush
        atexit.register(self.shutdown)

    def enqueue(self, event: Dict[str, Any]) -> None:
        """将事件加入缓冲区"""
        try:
            batch = None
            with self._lock:
                self._buffer.append(event)
                if len(self._buffer) >= self.max_batch_size:
                    batch = self._buffer[:]
                    self._buffer.clear()
            if batch:
                self._send_batch(batch)
        except Exception:
            pass

    def _flush_loop(self) -> None:
        """后台线程：定时 flush"""
        while self._running:
            time.sleep(self.flush_interval)
            self._flush()

    def _flush(self) -> None:
        """执行一次 flush"""
        try:
            with self._lock:
                if not self._buffer:
                    return
                batch = self._buffer[:]
                self._buffer.clear()
            self._send_batch(batch)
        except Exception:
            pass

    def _send_batch(self, batch: List[Dict[str, Any]]) -> None:
        """发送一批事件到 POST /api/ingest"""
        if not batch:
            return

        url = f"{self.base_url}/api/ingest"
        payload = json.dumps({"events": batch}).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "X-API-Key": self.api_key,
        }

        for attempt in range(self.max_retries):
            try:
                req = Request(url, data=payload, headers=headers, method="POST")
                with urlopen(req, timeout=10) as resp:
                    if resp.status < 300:
                        logger.debug("Batch sent: %d events", len(batch))
                        return
            except URLError as e:
                logger.debug("Send attempt %d failed: %s", attempt + 1, e)
                if attempt < self.max_retries - 1:
                    time.sleep(2 ** attempt)
            except Exception:
                break

        logger.warning("Failed to send batch of %d events after %d retries", len(batch), self.max_retries)

    def send_score(self, score_data: Dict[str, Any]) -> None:
        """直接发送 Score 到 POST /api/scores"""
        try:
            url = f"{self.base_url}/api/scores"
            payload = json.dumps(score_data).encode("utf-8")
            headers = {
                "Content-Type": "application/json",
                "X-API-Key": self.api_key,
            }
            req = Request(url, data=payload, headers=headers, method="POST")
            with urlopen(req, timeout=10):
                pass
        except Exception as e:
            logger.debug("Score send failed: %s", e)

    def shutdown(self) -> None:
        """关闭传输层，最后 flush"""
        self._running = False
        self._flush()
