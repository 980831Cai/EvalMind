<p align="center">
  <img src="https://img.shields.io/badge/EvalMind-AI%20Agent%20Evaluation-6366f1?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIyMiIgY3k9IjMwIiByPSI5IiBmaWxsPSIjZmJiZjI0Ii8+PGNpcmNsZSBjeD0iNDIiIGN5PSIzMCIgcj0iOSIgZmlsbD0iI2ZiYmYyNCIvPjxjaXJjbGUgY3g9IjIzIiBjeT0iMjkuNSIgcj0iMi44IiBmaWxsPSIjMWUxYjRiIi8+PGNpcmNsZSBjeD0iNDMiIGN5PSIyOS41IiByPSIyLjgiIGZpbGw9IiMxZTFiNGIiLz48L3N2Zz4=&logoColor=white" alt="EvalMind" />
</p>

<h1 align="center">🦉 EvalMind</h1>

<p align="center">
  <strong>Open-Source Evaluation Platform for AI Agents</strong><br/>
  <em>Self-hosted · Privacy-first · Full evaluation lifecycle</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/python-3.12+-3776ab?style=flat-square&logo=python&logoColor=white" alt="Python" />
  <img src="https://img.shields.io/badge/react-18-61dafb?style=flat-square&logo=react&logoColor=white" alt="React" />
  <img src="https://img.shields.io/badge/fastapi-0.115-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/mysql-8.0-4479a1?style=flat-square&logo=mysql&logoColor=white" alt="MySQL" />
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square" alt="License" />
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#features">Features</a> &middot;
  <a href="#architecture">Architecture</a> &middot;
  <a href="#agent-integration">Agent Integration</a> &middot;
  <a href="#contributing">Contributing</a>
</p>

---

## What is EvalMind?

EvalMind is an open-source, **self-hosted** evaluation platform for AI Agents. It provides end-to-end testing and scoring infrastructure — from agent integration and test case management through automated multi-dimensional evaluation, observability tracing, online assessment, human annotation, all the way to strategy evolution.

EvalMind connects to your agent via HTTP, OpenAI-compatible API, or SDK, runs your test suites against it, scores the results using multiple judge models, and surfaces actionable insights through a rich analytics dashboard.

### Why EvalMind Exists

AI Agents are becoming critical infrastructure. Teams ship new prompts, swap models, and add tools constantly. But how do you know if your agent actually got *better*? Without systematic evaluation, you're flying blind — regressions slip through, edge cases go unnoticed, and "it works on my machine" becomes the only quality bar.

EvalMind closes that gap by providing **automated, repeatable, multi-dimensional evaluation** that can run against every iteration of your agent. Think of it as CI/CD for agent quality.

### Why Self-Hosted?

- **Data privacy** — Your evaluation data, agent outputs, and test cases never leave your infrastructure. No third-party SaaS has access to your proprietary prompts or user interactions.
- **Full control** — Deploy on your own servers, customize scoring logic, and integrate with your existing CI/CD pipeline.
- **No vendor lock-in** — Use any LLM provider as the judge model. Swap between OpenAI, DeepSeek, Anthropic, Google Gemini, or run fully offline with Ollama.
- **Cost-effective** — No per-seat pricing or usage limits. Run as many evaluations as you need.

> **Note**
>
> **EvalMind supports the full evaluation lifecycle**
>
> Unlike simple LLM benchmarks, EvalMind handles the complete workflow: agent integration, test case management, automated scoring (LLM-as-Judge + deterministic assertions), observability tracing, experiment comparison, bad case analysis, human annotation, and strategy evolution. It's designed for teams that ship agents to production.

---

## Quick Start

### Prerequisites

| Dependency | Version | Install |
|---|---|---|
| **Python** | 3.12+ | [python.org](https://www.python.org/downloads/) |
| **Node.js** | 18+ | [nodejs.org](https://nodejs.org/) |
| **Docker** | 20.10+ | [docker.com](https://www.docker.com/products/docker-desktop/) (for MySQL) |

### One-Command Setup

<details open>
<summary><strong>🐧 Linux / 🍎 macOS</strong></summary>

```bash
# Clone
git clone https://github.com/980831Cai/EvalMind.git && cd EvalMind

# Database + Backend + Frontend — all in one go
cd backend && bash setup-database.sh && \
  python3 -m venv venv && source venv/bin/activate && \
  pip install -r requirements.txt && \
  cp .env.example .env && \
  npx prisma generate && npx prisma db push && \
  uvicorn main:app --reload --host 0.0.0.0 --port 8000 &
cd ../frontend && npm install && npm run dev
```

</details>

<details>
<summary><strong>🪟 Windows (PowerShell)</strong></summary>

```powershell
# Clone
git clone https://github.com/980831Cai/EvalMind.git; cd EvalMind

# Database (requires Docker Desktop running)
cd backend; bash setup-database.sh

# Backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
npx prisma generate
npx prisma db push
Start-Process -NoNewWindow uvicorn -ArgumentList "main:app","--reload","--host","0.0.0.0","--port","8000"

# Frontend (new terminal)
cd ..\frontend
npm install
npm run dev
```

</details>

### Step-by-Step Setup

If you prefer a step-by-step approach:

**1. Clone**
```bash
git clone https://github.com/980831Cai/EvalMind.git
cd EvalMind
```

**2. Database** — starts a MySQL 8.0 container via Docker
```bash
cd backend
bash setup-database.sh
```

**3. Backend**
```bash
python3 -m venv venv && source venv/bin/activate   # Linux/macOS
# python -m venv venv; .\venv\Scripts\Activate.ps1  # Windows

pip install -r requirements.txt
cp .env.example .env        # Edit .env → choose your LLM provider, add API key
npx prisma generate
npx prisma db push
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**4. Frontend** (new terminal)
```bash
cd frontend
npm install
npm run dev
```

**Done!** Open **http://localhost:5173** 🎉

> Backend API docs available at **http://localhost:8000/docs**

---

## Configuration

After setup, edit `backend/.env` to configure your LLM judge model. Choose any provider:

```bash
# Pick ONE provider and fill in your API key:

# OpenAI
JUDGE_LLM_BASE_URL=https://api.openai.com/v1
JUDGE_LLM_API_KEY=sk-your-key
JUDGE_LLM_MODEL=gpt-4o

# DeepSeek
JUDGE_LLM_BASE_URL=https://api.deepseek.com/v1
JUDGE_LLM_API_KEY=sk-your-key
JUDGE_LLM_MODEL=deepseek-chat

# Anthropic Claude
JUDGE_LLM_BASE_URL=https://api.anthropic.com/v1
JUDGE_LLM_API_KEY=sk-ant-your-key
JUDGE_LLM_MODEL=claude-sonnet-4-20250514

# Google Gemini
JUDGE_LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
JUDGE_LLM_API_KEY=your-google-key
JUDGE_LLM_MODEL=gemini-2.0-flash

# Ollama (local, no API key required)
JUDGE_LLM_BASE_URL=http://localhost:11434/v1
JUDGE_LLM_API_KEY=ollama
JUDGE_LLM_MODEL=qwen2.5:14b
```

You can also configure judge models directly in the **Settings** page of the web UI. Pre-configured templates for all major providers are included — just add your API key.

> Any service compatible with the OpenAI Chat Completions API is supported.

### All Environment Variables

| Variable | Required | Description | Example |
|---|---|---|---|
| `DATABASE_URL` | Yes | MySQL connection string | `mysql://user:pass@localhost:3306/db` |
| `JUDGE_LLM_BASE_URL` | Yes | Judge LLM API endpoint | `https://api.openai.com/v1` |
| `JUDGE_LLM_API_KEY` | Yes | Your LLM API key | `sk-...` |
| `JUDGE_LLM_MODEL` | Yes | Judge model name | `gpt-4o` |
| `CORS_ORIGINS` | No | Allowed CORS origins | `*` |
| `LOG_LEVEL` | No | Log level | `INFO` |

---

## Features

### Evaluation Engine
- **Automated evaluation** — single-turn and multi-turn conversation testing with concurrent execution and Pass@K
- **Multi-dimensional scoring** — accuracy, completeness, helpfulness, relevance, safety, tool_usage, and 20+ dimensions
- **16 deterministic assertions** — `contains`, `regex_match`, `json_valid`, `tool_called`, `latency_max`, etc.
- **4 scoring methods** — LLM-as-Judge / G-Eval / Rule Tree / Structured Scorer
- **Multi-Judge consensus** — multiple LLMs score in parallel, median eliminates bias

### Observability
- **Trace/Span tracking** — full call chain tracing with hierarchical span tree
- **OpenTelemetry compatible** — OTLP protocol receiver for seamless integration
- **Score entities** — scores linked to traces with detailed breakdowns

### Experiments & Comparison
- **Experiment system** — multi-variable experiments (model / prompt / temperature / tool config)
- **Cross-model comparison** — side-by-side model performance comparison
- **Regression detection** — automatic score regression alerts

### Analytics & Insights
- **Bad case management** — failure tracking, root cause analysis, status management
- **Skills analysis** — agent tool/skill usage health analysis
- **AI-powered insights** — intelligent optimization suggestions
- **Evolution tracking** — agent version score trends over time

### Platform
- **Self-hosted & private** — all data stays on your infrastructure
- **Online evaluation** — production referenceless real-time assessment
- **Human annotation** — annotation queue task management
- **Gene store** — store fix/optimization/innovation strategy prompt patches
- **Playground** — interactive agent debugging
- **Python & TypeScript SDK** — quick integration
- **i18n** — English & Chinese UI

---

## Architecture

```
┌───────────────────────────────────────────────────────────┐
│                    Frontend (React 18)                     │
│  TypeScript · Vite · TailwindCSS · Zustand · Recharts     │
└──────────────────────────┬────────────────────────────────┘
                           │ REST API
┌──────────────────────────▼────────────────────────────────┐
│                   Backend (FastAPI)                        │
│                                                           │
│  ┌─────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │ API     │  │ Services     │  │ Adapters             │ │
│  │ Routes  │→ │              │→ │                      │ │
│  │ (24)    │  │ EvalEngine   │  │ HTTP / OpenAI / Knot │ │
│  │         │  │ ScoringEngine│  │                      │ │
│  │         │  │ Judge (LLM)  │  └──────────┬───────────┘ │
│  │         │  │ TraceService │             │ invoke()     │
│  └─────────┘  └──────────────┘             ▼             │
│                                     ┌──────────────┐     │
│                                     │  Your Agent  │     │
│                                     └──────────────┘     │
└──────────────────────────┬────────────────────────────────┘
                           │ Prisma ORM
┌──────────────────────────▼────────────────────────────────┐
│                     MySQL 8.0                             │
│  20 Models: Agent · TestSuite · EvalRun · EvalResult ...  │
└───────────────────────────────────────────────────────────┘
```

### Evaluation Workflow

```
Create EvalRun → Snapshot Agent & TestSuite → Async Execution
                                                    │
         ┌──────────────────────────────────────────┘
         ▼
  ┌──────────────┐    ┌───────────────┐    ┌──────────────┐
  │ Invoke Agent │ →  │ Unified       │ →  │ Store Result │
  │ (via Adapter)│    │ Scoring       │    │ + Trace      │
  └──────────────┘    │ (Code + LLM)  │    └──────────────┘
         │            └───────────────┘           │
         ▼                    ▼                   ▼
  ┌──────────────┐    ┌───────────────┐    ┌──────────────┐
  │ Trace Eval   │    │ Failure Root  │    │ Bad Case     │
  │ (optional)   │    │ Cause Analysis│    │ Management   │
  └──────────────┘    └───────────────┘    └──────────────┘
```

---

## Agent Integration

### Option 1: HTTP API Adapter

Register your agent with type `http` and provide its endpoint URL. The platform sends POST requests:

```json
{
  "message": "user input",
  "conversation_id": "optional-session-id"
}
```

### Option 2: OpenAI-Compatible Adapter

For agents exposing an OpenAI Chat Completions API:

```json
{
  "type": "openai",
  "config": {
    "api_base": "https://your-agent-api.com/v1",
    "api_key": "your-key",
    "model": "your-model"
  }
}
```

### Option 3: Python SDK

```bash
pip install agent-eval-sdk
```

```python
from agent_eval import AgentEval

client = AgentEval(
    base_url="http://localhost:8000",
    api_key="optional-ingest-key"
)

# Decorator — automatic tracing
@client.observe(name="my-agent")
def my_agent(message: str) -> str:
    return call_llm(message)

# Context manager
with client.trace("agent-session") as trace:
    with trace.span("llm-call") as span:
        result = call_llm(prompt)
        span.set_output(result)
```

### Option 4: TypeScript SDK

```bash
npm install agent-eval-sdk
```

```typescript
import { AgentEval } from 'agent-eval-sdk';

const client = new AgentEval({
  baseUrl: 'http://localhost:8000',
  apiKey: 'optional-ingest-key',
});

const trace = client.trace({ name: 'my-agent' });
const span = trace.span({ name: 'llm-call' });
// ... your agent logic
span.end({ output: result });
trace.end();
```

---

## Project Structure

```
EvalMind/
├── backend/                    # Python FastAPI backend
│   ├── main.py                 # Application entry point
│   ├── app/
│   │   ├── api/                # API routes (24 modules)
│   │   ├── services/           # Business logic (26 modules)
│   │   ├── adapters/           # Agent adapters (HTTP/OpenAI/Knot)
│   │   ├── core/               # Core config (config/database/logging)
│   │   ├── models/             # Pydantic data models
│   │   └── types/              # Type definitions
│   ├── prisma/schema.prisma    # Database schema (20 models)
│   ├── migrations/             # SQL migration files
│   ├── tests/                  # Test suite
│   └── requirements.txt        # Python dependencies
├── frontend/                   # React 18 frontend
│   ├── src/
│   │   ├── pages/              # 20+ page components
│   │   ├── components/         # Shared components
│   │   ├── stores/             # Zustand state management
│   │   ├── i18n/               # i18n (EN/ZH)
│   │   └── styles/             # TailwindCSS styles
│   └── package.json
├── sdk/                        # Official SDKs
│   ├── python/                 # Python SDK
│   └── typescript/             # TypeScript SDK
├── test-agent/                 # Example test agent
├── docs/                       # Documentation
├── docker-compose.yml          # Docker Compose config
├── Dockerfile                  # Multi-stage build
├── .env.example                # Environment variable template
├── .github/                    # CI/CD & issue templates
├── CONTRIBUTING.md             # Contribution guide
├── CHANGELOG.md                # Changelog
└── LICENSE                     # Apache-2.0
```

---

## API Docs

After starting the server, auto-generated API documentation is available at:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

### Core Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/agents` | GET/POST | Agent management |
| `/api/test-suites` | GET/POST | Test suite management |
| `/api/eval-runs` | GET/POST | Evaluation runs |
| `/api/eval-runs/{id}/results` | GET | Evaluation results |
| `/api/dashboard/stats` | GET | Dashboard statistics |
| `/api/model-configs` | GET/POST | Judge model configuration |
| `/api/v2/traces` | POST | Public trace ingestion API |
| `/api/v1/traces` | POST | OTLP protocol receiver |

---

## Testing

```bash
# Backend tests
cd backend
source venv/bin/activate
pip install -r requirements-dev.txt
pytest -v

# Frontend tests
cd frontend
npm run test

# Linting
cd backend && ruff check .
cd frontend && npx eslint src/
```

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines.

```bash
# Fork & Clone
git clone https://github.com/980831Cai/EvalMind.git

# Create a branch
git checkout -b feat/your-feature

# Commit (follow Conventional Commits)
git commit -m "feat: add new scoring dimension"

# Push & open a PR
git push origin feat/your-feature
```

---

## License

[Apache License 2.0](./LICENSE) — free to use, modify, and distribute.

---

<p align="center">
  <strong>🦉 EvalMind — Making AI Agent evaluation systematic and reliable.</strong>
</p>
