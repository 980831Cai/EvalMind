"""EvalMind - AI Agent Evaluation Platform Backend"""
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
    # Start online evaluation worker
    from app.services.online_eval_worker import start_worker, stop_worker
    await start_worker()
    yield
    await stop_worker()
    await close_http_client()
    await disconnect_db()


app = FastAPI(
    title="EvalMind - AI Agent Evaluation Platform",
    description="""Open-source evaluation platform for AI Agents — integrate any agent via HTTP API.

## Quick Start

The simplest way to ingest a trace — use curl:

```bash
curl -X POST http://localhost:8000/api/v2/traces \\
  -H "Content-Type: application/json" \\
  -d '{"name": "chat", "input": "hello", "output": "hi"}'
```

## Integration Methods

| Method | Use Case |
|--------|----------|
| **REST API v2** (`/api/v2/`) | Any language, direct HTTP ingestion |
| **Python SDK** | Python projects, decorator/context manager |
| **TypeScript SDK** | Node.js projects |
| **OTel OTLP** (`/api/v1/traces`) | Projects already using OpenTelemetry |
| **Webhook** (`/api/v2/webhook/`) | Receive pushes from external platforms |
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

    # Reserved path prefixes (API routes and FastAPI built-in doc routes)
    _RESERVED_PREFIXES = ("api/", "docs", "redoc", "openapi.json")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        # API and doc routes are not handled by frontend — return 404 for FastAPI router
        if full_path.startswith("api/"):
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=404, content={"detail": "Not Found"})
        # FastAPI built-in doc routes: don't intercept, let FastAPI handle them
        # Note: docs/redoc/openapi.json are auto-registered by FastAPI and won't reach here
        file_path = os.path.normpath(os.path.join(FRONTEND_DIR, full_path))
        # Path traversal protection
        if not file_path.startswith(FRONTEND_DIR):
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=403, content={"detail": "Forbidden"})
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(
            os.path.join(FRONTEND_DIR, "index.html"),
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
        )
