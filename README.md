<p align="center">
  <img src="https://img.shields.io/badge/EvalMind-AI%20Agent%20Evaluation-6366f1?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIyMiIgY3k9IjMwIiByPSI5IiBmaWxsPSIjZmJiZjI0Ii8+PGNpcmNsZSBjeD0iNDIiIGN5PSIzMCIgcj0iOSIgZmlsbD0iI2ZiYmYyNCIvPjxjaXJjbGUgY3g9IjIzIiBjeT0iMjkuNSIgcj0iMi44IiBmaWxsPSIjMWUxYjRiIi8+PGNpcmNsZSBjeD0iNDMiIGN5PSIyOS41IiByPSIyLjgiIGZpbGw9IiMxZTFiNGIiLz48L3N2Zz4=&logoColor=white" alt="EvalMind" />
</p>

<h1 align="center">🦉 EvalMind</h1>

<p align="center">
  <strong>开源 AI Agent 通用评测平台</strong><br/>
  <em>Open-source universal evaluation platform for AI Agents</em>
</p>

<p align="center">
  <a href="#-快速开始"><img src="https://img.shields.io/badge/-Quick%20Start-22c55e?style=flat-square" alt="Quick Start" /></a>
  <a href="#-功能特性"><img src="https://img.shields.io/badge/-Features-6366f1?style=flat-square" alt="Features" /></a>
  <a href="#-架构"><img src="https://img.shields.io/badge/-Architecture-f59e0b?style=flat-square" alt="Architecture" /></a>
  <a href="./CONTRIBUTING.md"><img src="https://img.shields.io/badge/-Contributing-ec4899?style=flat-square" alt="Contributing" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/python-3.12+-3776ab?style=flat-square&logo=python&logoColor=white" alt="Python" />
  <img src="https://img.shields.io/badge/react-18-61dafb?style=flat-square&logo=react&logoColor=white" alt="React" />
  <img src="https://img.shields.io/badge/fastapi-0.115-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/mysql-8.0-4479a1?style=flat-square&logo=mysql&logoColor=white" alt="MySQL" />
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square" alt="License" />
</p>

---

## 📖 简介 | Introduction

**EvalMind** 是一个功能完备的 AI Agent 评测平台，支持从 Agent 接入、测试用例管理、自动化评测、多维度评分、可观测性追踪、在线评估、人工标注，一直到策略进化优化的**完整评测闭环**。

EvalMind is a full-featured AI Agent evaluation platform supporting the complete evaluation lifecycle — from agent integration, test case management, automated evaluation, multi-dimensional scoring, observability tracing, online assessment, human annotation, all the way to strategy evolution and optimization.

### 为什么选择 EvalMind？| Why EvalMind?

| | EvalMind | 其他方案 |
|---|---|---|
| **Agent 接入** | HTTP / OpenAI / Knot 多种适配器 | 通常只支持单一协议 |
| **评分方法** | LLM-as-Judge + G-Eval + 规则树 + 结构化度量 + 16 种确定性断言 | 单一评分方式 |
| **可观测性** | 内置 Trace/Span + OpenTelemetry 兼容 | 需要外部集成 |
| **多 Judge** | 共识评分（多 LLM 并发 + 取中位数） | 单模型评分 |
| **在线评估** | Referenceless 无参考答案实时评估 | 仅离线评测 |
| **部署** | Docker 一键部署，支持 Linux/macOS/Windows | 复杂的手动配置 |
| **SDK** | Python + TypeScript 双语 SDK | 语言支持有限 |

---

## ✨ 功能特性 | Features

### 🎯 核心评测
- **自动化评测引擎** — 支持单轮/多轮对话评测，并发执行，Pass@K 多次运行
- **多维度评分** — accuracy / completeness / helpfulness / relevance / safety / tool_usage 等 20+ 维度
- **16 种确定性断言** — contains / regex_match / json_valid / tool_called / latency_max 等
- **4 种评分方法** — LLM-as-Judge / G-Eval / Rule Tree / Structured Scorer
- **Multi-Judge 共识** — 多个 LLM 并发评分，取中位数消除偏差

### 🔍 可观测性
- **Trace/Span 追踪** — 完整调用链追踪，支持树形 Span 层级
- **OpenTelemetry 兼容** — OTLP 协议接收器，无缝接入现有可观测性体系
- **独立评分实体** — Score 与 Trace 关联，灵活查看评分详情

### 🧪 实验与对比
- **实验系统** — 多变量实验（模型/Prompt/温度/工具配置）
- **跨模型对比** — 并排对比不同模型表现
- **回归对比** — 自动检测评测分数回归

### 📊 分析与洞察
- **Bad Case 管理** — 失败用例追踪、根因分析、状态管理
- **Skills 分析** — Agent 工具/技能使用健康度分析
- **智能洞察** — AI 驱动的优化建议
- **进化追踪** — Agent 迭代版本分数趋势

### 🔧 平台能力
- **在线评估** — 生产环境 Referenceless 实时评估
- **人工标注** — 标注队列任务管理
- **策略基因库** — 存储修复/优化/创新策略的 Prompt 补丁
- **Playground** — Agent 交互式调试
- **Python & TypeScript SDK** — 快速接入

---

## 🏗️ 架构 | Architecture

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
│  │ (24个)  │  │ EvalEngine   │  │ HTTP / OpenAI / Knot │ │
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

### 评测工作流

```
创建 EvalRun → 快照 Agent & TestSuite → 异步执行
                                           │
         ┌─────────────────────────────────┘
         ▼
  ┌──────────────┐    ┌───────────────┐    ┌──────────────┐
  │ 调用 Agent   │ →  │ 统一评分      │ →  │ 存储结果     │
  │ (via Adapter)│    │ Code + LLM    │    │ + Trace      │
  └──────────────┘    └───────────────┘    └──────────────┘
         │                    │
         ▼                    ▼
  ┌──────────────┐    ┌───────────────┐
  │ 轨迹评估     │    │ 失败归因分析  │
  │ (可选)       │    │ (可选)        │
  └──────────────┘    └───────────────┘
```

---

## 🚀 快速开始 | Quick Start

### 前置要求 | Prerequisites

| 依赖 | 版本 | 安装指引 |
|------|------|---------|
| **Docker** & Docker Compose | 20.10+ | [docker.com](https://www.docker.com/products/docker-desktop/) |
| **Git** | 2.0+ | [git-scm.com](https://git-scm.com/) |

> 💡 推荐使用 Docker 一键部署，无需手动安装 Python/Node.js/MySQL。

### 方式一：Docker Compose 一键部署（推荐）

适用于 **Linux / macOS / Windows (WSL2)**

```bash
# 1. 克隆项目
git clone https://github.com/your-username/evalmind.git
cd evalmind

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入你的 LLM API Key（支持 OpenAI / DeepSeek / Ollama 等）
# vim .env

# 3. 一键启动
docker compose up -d

# 4. 等待服务就绪（约 30-60 秒）
docker compose logs -f app
```

启动完成后访问 **http://localhost:8000** 🎉

### 方式二：本地开发部署

<details>
<summary><strong>📦 展开查看详细步骤</strong></summary>

#### 前置要求（本地开发）

| 依赖 | 版本 |
|------|------|
| Python | 3.12+ |
| Node.js | 18+ |
| MySQL | 8.0 |

#### 步骤

```bash
# 1. 克隆并进入项目
git clone https://github.com/your-username/evalmind.git
cd evalmind

# 2. 启动数据库（任选一种）
# 方式 A：使用安装脚本
cd backend && bash setup-database.sh && cd ..

# 方式 B：使用 Docker Compose 仅启动 MySQL
docker compose up mysql -d

# 3. 后端设置
cd backend
python3 -m venv venv

# Linux / macOS:
source venv/bin/activate
# Windows (PowerShell):
# .\venv\Scripts\Activate.ps1
# Windows (CMD):
# venv\Scripts\activate.bat

pip install -r requirements.txt
cp .env.example .env
# 编辑 .env，填入 DATABASE_URL 和 JUDGE_LLM_API_KEY

# 4. 初始化数据库
npx prisma generate
npx prisma db push

# 5. 启动后端（开发模式）
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 6. 前端设置（新终端）
cd frontend
npm install
npm run dev
```

前端访问 **http://localhost:5173**，后端 API 访问 **http://localhost:8000/docs**

</details>

### 方式三：Windows 原生部署

<details>
<summary><strong>🪟 展开查看 Windows 步骤</strong></summary>

```powershell
# 1. 安装 Docker Desktop (含 WSL2 backend)
# 下载: https://www.docker.com/products/docker-desktop/

# 2. 克隆项目
git clone https://github.com/your-username/evalmind.git
cd evalmind

# 3. 配置环境变量
copy .env.example .env
# 用记事本编辑 .env，填入 LLM API Key
# notepad .env

# 4. 启动
docker compose up -d

# 5. 访问 http://localhost:8000
```

**不使用 Docker 的 Windows 部署：**

```powershell
# 1. 安装 MySQL 8.0: https://dev.mysql.com/downloads/installer/
# 2. 安装 Python 3.12: https://www.python.org/downloads/
# 3. 安装 Node.js 18+: https://nodejs.org/

# 4. 后端
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
# 编辑 .env 中的 DATABASE_URL 指向本地 MySQL

npx prisma generate
npx prisma db push
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 5. 前端（新终端）
cd frontend
npm install
npm run dev
```

</details>

---

## ⚙️ 配置 | Configuration

### 环境变量

| 变量 | 必填 | 说明 | 示例 |
|------|------|------|------|
| `DATABASE_URL` | ✅ | MySQL 连接串 | `mysql://user:pass@localhost:3306/dbname` |
| `JUDGE_LLM_BASE_URL` | ✅ | Judge LLM API 地址 | `https://api.deepseek.com/v1` |
| `JUDGE_LLM_API_KEY` | ✅ | Judge LLM API Key | `sk-xxx` |
| `JUDGE_LLM_MODEL` | ✅ | Judge 模型名称 | `deepseek-chat` |
| `CORS_ORIGINS` | ❌ | CORS 允许源 | `*` |
| `LOG_LEVEL` | ❌ | 日志级别 | `INFO` |

### 支持的 LLM 服务

| 服务 | BASE_URL | MODEL |
|------|----------|-------|
| **OpenAI** | `https://api.openai.com/v1` | `gpt-4o` / `gpt-4o-mini` |
| **DeepSeek** | `https://api.deepseek.com/v1` | `deepseek-chat` |
| **Ollama** (本地) | `http://localhost:11434/v1` | `qwen2.5:14b` |
| **vLLM** | `http://localhost:8080/v1` | 自定义模型名 |
| **Azure OpenAI** | `https://{name}.openai.azure.com/...` | 部署名 |

> 任何兼容 OpenAI Chat Completions API 的服务均可接入。

---

## 🔌 Agent 接入 | Agent Integration

### 方式一：HTTP API 适配器

注册 Agent 时选择 `http` 类型，配置 Agent 的 HTTP 端点 URL。平台会发送 POST 请求：

```json
{
  "message": "用户输入内容",
  "conversation_id": "可选的会话ID"
}
```

### 方式二：OpenAI 兼容适配器

适用于兼容 OpenAI Chat Completions API 的 Agent：

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

### 方式三：Python SDK

```bash
pip install agent-eval-sdk
```

```python
from agent_eval import AgentEval

client = AgentEval(
    base_url="http://localhost:8000",
    api_key="optional-ingest-key"
)

# 装饰器模式 — 自动追踪
@client.observe(name="my-agent")
def my_agent(message: str) -> str:
    return call_llm(message)

# 上下文管理器模式
with client.trace("agent-session") as trace:
    with trace.span("llm-call") as span:
        result = call_llm(prompt)
        span.set_output(result)
```

### 方式四：TypeScript SDK

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

## 📁 项目结构 | Project Structure

```
evalmind/
├── backend/                    # Python FastAPI 后端
│   ├── main.py                 # 应用入口
│   ├── app/
│   │   ├── api/                # API 路由层 (24 modules)
│   │   ├── services/           # 业务逻辑层 (26 modules)
│   │   ├── adapters/           # Agent 适配器 (HTTP/OpenAI/Knot)
│   │   ├── core/               # 核心配置 (config/database/logging)
│   │   ├── models/             # Pydantic 数据模型
│   │   └── types/              # 类型定义
│   ├── prisma/schema.prisma    # 数据库 Schema (18 models)
│   ├── migrations/             # SQL 迁移文件
│   ├── tests/                  # 测试套件
│   └── requirements.txt        # Python 依赖
├── frontend/                   # React 18 前端
│   ├── src/
│   │   ├── pages/              # 20+ 页面组件
│   │   ├── components/         # 通用组件
│   │   ├── stores/             # Zustand 状态管理
│   │   ├── i18n/               # 中英双语国际化
│   │   └── styles/             # TailwindCSS 样式
│   └── package.json
├── sdk/                        # 官方 SDK
│   ├── python/                 # Python SDK
│   └── typescript/             # TypeScript SDK
├── test-agent/                 # 示例测试 Agent
├── docs/                       # 文档
├── docker-compose.yml          # 一键部署编排
├── Dockerfile                  # 多阶段构建
├── .env.example                # 环境变量模板
├── .github/                    # CI/CD & Issue 模板
├── CONTRIBUTING.md             # 贡献指南
├── CHANGELOG.md                # 变更日志
└── LICENSE                     # Apache-2.0
```

---

## 🧪 测试 | Testing

```bash
# 后端测试
cd backend
source venv/bin/activate  # Linux/macOS
pip install -r requirements-dev.txt
pytest -v

# 前端测试
cd frontend
npm run test

# Lint 检查
cd backend && ruff check .
cd frontend && npx eslint src/
```

---

## 📡 API 文档 | API Docs

启动服务后访问自动生成的 Swagger 文档：

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

### 核心 API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/agents` | GET/POST | Agent 管理 |
| `/api/test-suites` | GET/POST | 测试套件管理 |
| `/api/eval-runs` | GET/POST | 评测运行 |
| `/api/eval-runs/{id}/results` | GET | 评测结果 |
| `/api/dashboard/stats` | GET | 仪表盘统计 |
| `/api/model-config` | GET/POST | Judge 模型配置 |
| `/api/v2/traces` | POST | 公开 Trace 上报 API |
| `/api/v1/traces` | POST | OTLP 协议接收 |

---

## 🤝 贡献 | Contributing

欢迎所有形式的贡献！请查看 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解详细指南。

```bash
# Fork & Clone
git clone https://github.com/your-username/evalmind.git

# 创建分支
git checkout -b feat/your-feature

# 提交（遵循 Conventional Commits）
git commit -m "feat: add new scoring dimension"

# 推送 & 创建 PR
git push origin feat/your-feature
```

---

## 📄 许可证 | License

[Apache License 2.0](./LICENSE) — 自由使用、修改、分发。

---

<p align="center">
  <strong>🦉 EvalMind — 让 AI Agent 评测更简单</strong><br/>
  <em>Making AI Agent evaluation simpler.</em>
</p>
