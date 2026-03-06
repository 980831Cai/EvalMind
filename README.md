<p align="center">
  <img src="https://img.shields.io/badge/EvalMind-AI%20Agent%20Evaluation-6366f1?style=for-the-badge&logoColor=white" alt="EvalMind" />
</p>

<h1 align="center">EvalMind</h1>

<p align="center">
  <strong>Open-Source Evaluation Platform for AI Agents</strong>
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

EvalMind is an open-source evaluation platform for AI Agents. It provides end-to-end testing and scoring infrastructure — from agent integration and test case management through automated multi-dimensional evaluation, observability tracing, online assessment, human annotation, all the way to strategy evolution.

EvalMind connects to your agent via HTTP, OpenAI-compatible API, or SDK, then runs your test suites against it, scores the results using multiple judge models, and surfaces actionable insights through a rich analytics dashboard.

### Why EvalMind Exists

AI Agents are becoming critical infrastructure. Teams ship new prompts, swap models, and add tools constantly. But how do you know if your agent actually got *better*? Without systematic evaluation, you're flying blind — regressions slip through, edge cases go unnoticed, and "it works on my machine" becomes the only quality bar.

EvalMind closes that gap by providing **automated, repeatable, multi-dimensional evaluation** that can run against every iteration of your agent. Think of it as CI/CD for agent quality.

> **Note**
>
> **EvalMind supports the full evaluation lifecycle**
>
> Unlike simple LLM benchmarks, EvalMind handles the complete workflow: agent integration, test case management, automated scoring (LLM-as-Judge + deterministic assertions), observability tracing, experiment comparison, bad case analysis, human annotation, and strategy evolution. It's designed for teams that ship agents to production.

---

## Quick Start

### Prerequisites

| Dependency | Version |
|---|---|
| **Python** | 3.12+ |
| **Node.js** | 18+ |
| **MySQL** | 8.0 |

### 1. Clone and Install

```bash
git clone https://github.com/980831Cai/EvalMind.git
cd EvalMind
```

### 2. Set Up the Database

```bash
cd backend
bash setup-database.sh
cd ..
```

### 3. Backend Setup

```bash
cd backend

# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate        # Linux / macOS
# .\venv\Scripts\Activate.ps1   # Windows (PowerShell)

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env — choose your LLM provider and fill in your API key
# Supported: OpenAI / DeepSeek / Anthropic / Google Gemini / Ollama

# Initialize database
npx prisma generate
npx prisma db push

# Start backend (dev mode)
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 4. Frontend Setup (new terminal)

```bash
cd frontend
npm install
npm run dev
```

Frontend: **http://localhost:5173** | Backend API docs: **http://localhost:8000/docs**

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
- **Online evaluation** — production referenceless real-time assessment
- **Human annotation** — annotation queue task management
- **Gene store** — store fix/optimization/innovation strategy prompt patches
- **Playground** — interactive agent debugging
- **Python & TypeScript SDK** — quick integration

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
│  18 Models: Agent · TestSuite · EvalRun · EvalResult ...  │
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

## Configuration

### Environment Variables

| Variable | Required | Description | Example |
|---|---|---|---|
| `DATABASE_URL` | Yes | MySQL connection string | `mysql://user:pass@localhost:3306/dbname` |
| `JUDGE_LLM_BASE_URL` | Yes | Judge LLM API endpoint | `https://api.deepseek.com/v1` |
| `JUDGE_LLM_API_KEY` | Yes | Judge LLM API key | `sk-xxx` |
| `JUDGE_LLM_MODEL` | Yes | Judge model name | `deepseek-chat` |
| `CORS_ORIGINS` | No | Allowed CORS origins | `*` |
| `LOG_LEVEL` | No | Log level | `INFO` |

### Supported LLM Providers

| Provider | BASE_URL | MODEL |
|---|---|---|
| **OpenAI** | `https://api.openai.com/v1` | `gpt-4o` / `gpt-4o-mini` |
| **DeepSeek** | `https://api.deepseek.com/v1` | `deepseek-chat` |
| **Anthropic** | `https://api.anthropic.com/v1` | `claude-sonnet-4-20250514` |
| **Google Gemini** | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.0-flash` |
| **Ollama** (local) | `http://localhost:11434/v1` | `qwen2.5:14b` |
| **vLLM** | `http://localhost:8080/v1` | custom model name |
| **Azure OpenAI** | `https://{name}.openai.azure.com/...` | deployment name |

> Any service compatible with the OpenAI Chat Completions API can be used.
> Pre-configured model templates are available in the Settings page — just add your API key.

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
│   ├── prisma/schema.prisma    # Database schema (18 models)
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
| `/api/model-config` | GET/POST | Judge model configuration |
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
  <strong>EvalMind — Making AI Agent evaluation systematic and reliable.</strong>
</p>
