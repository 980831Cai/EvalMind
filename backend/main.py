"""Agent 评测平台 - 后端入口"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

from app.core.database import connect_db, disconnect_db
from app.core.logging import setup_logging
from app.core.http_client import close_http_client
from app.api import model_config, agents, test_suites, eval_runs, dashboard
from app.api import eval_framework, comparisons, bad_cases, skills_analysis, playground
from app.api import experiments, ingest, insights, error_breakdown
from app.api import observability, otlp_receiver, scores, online_eval, annotation_queues
from app.api import public_api
from app.api import genes, improvement_report, evolution, eval_knowledge


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.core.config import settings
    setup_logging(log_level=settings.LOG_LEVEL)
    await connect_db()
    # 启动在线评估 Worker
    from app.services.online_eval_worker import start_worker, stop_worker
    await start_worker()
    yield
    await stop_worker()
    await close_http_client()
    await disconnect_db()


app = FastAPI(
    title="Agent 评测平台",
    description="""通用 AI Agent 评测平台 — 支持任何语言通过 HTTP API 接入。

## 快速接入

最简单的接入方式 — 用 curl 上报一条 Trace：

```bash
curl -X POST http://localhost:8000/api/v2/traces \\
  -H "Content-Type: application/json" \\
  -d '{"name": "chat", "input": "hello", "output": "hi"}'
```

## 接入方式

| 方式 | 适用场景 |
|------|---------|
| **REST API v2** (`/api/v2/`) | 任何语言，通过 HTTP 直接上报 |
| **Python SDK** | Python 项目，装饰器/Context Manager |
| **TypeScript SDK** | Node.js 项目 |
| **OTel OTLP** (`/api/v1/traces`) | 已使用 OpenTelemetry 的项目 |
| **Webhook** (`/api/v2/webhook/`) | 接收外部平台推送 |
""",
    version="6.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

from app.core.config import settings as _settings
_cors_origins = [o.strip() for o in _settings.CORS_ORIGINS.split(",") if o.strip()] if _settings.CORS_ORIGINS else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(model_config.router, prefix="/api")
app.include_router(agents.router, prefix="/api")
app.include_router(test_suites.router, prefix="/api")
app.include_router(eval_runs.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(observability.router, prefix="/api")
app.include_router(otlp_receiver.router, prefix="/api")
app.include_router(eval_framework.router, prefix="/api")
app.include_router(comparisons.router, prefix="/api")
app.include_router(bad_cases.router, prefix="/api")
app.include_router(skills_analysis.router, prefix="/api")
app.include_router(playground.router, prefix="/api")
app.include_router(experiments.router, prefix="/api")
app.include_router(ingest.router, prefix="/api")
app.include_router(insights.router, prefix="/api")
app.include_router(error_breakdown.router, prefix="/api")
app.include_router(scores.router, prefix="/api")
app.include_router(online_eval.router, prefix="/api")
app.include_router(annotation_queues.router, prefix="/api")
app.include_router(public_api.router, prefix="/api")
app.include_router(genes.router, prefix="/api")
app.include_router(improvement_report.router, prefix="/api")
app.include_router(evolution.router, prefix="/api")
app.include_router(eval_knowledge.router, prefix="/api")

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "dist")
FRONTEND_DIR = os.path.normpath(FRONTEND_DIR)

if os.path.exists(FRONTEND_DIR):
    assets_dir = os.path.join(FRONTEND_DIR, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    # 需要排除的路径前缀（API 路由和 FastAPI 内置文档路由）
    _RESERVED_PREFIXES = ("api/", "docs", "redoc", "openapi.json")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        # API 和文档路由不由前端处理，返回 404 让 FastAPI 的路由系统处理
        if full_path.startswith("api/"):
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=404, content={"detail": "Not Found"})
        # FastAPI 内置文档路由：不拦截，让 FastAPI 自己处理
        # 注意：docs/redoc/openapi.json 由 FastAPI 自动注册，不会走到这里
        file_path = os.path.normpath(os.path.join(FRONTEND_DIR, full_path))
        # 路径穿越防护
        if not file_path.startswith(FRONTEND_DIR):
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=403, content={"detail": "Forbidden"})
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(
            os.path.join(FRONTEND_DIR, "index.html"),
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
        )
