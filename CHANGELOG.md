# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [6.0.0] - 2026-03-06

### Added
- **Open Source Release** — First public open-source release
- **20+ Pages** — Full React frontend UI (Dashboard, Eval Center, Traces, Experiments, Comparisons, etc.)
- **Evaluation Engine v6** — Single-turn/multi-turn conversation testing, Pass@K, concurrent execution
- **4 Scoring Methods** — LLM-as-Judge / G-Eval / Rule Tree / Structured Scorer
- **16 Deterministic Assertions** — contains / regex_match / json_valid / tool_called, etc.
- **Multi-Judge Consensus Scoring** — Multiple LLMs score in parallel, median eliminates bias
- **3 Agent Adapters** — HTTP / OpenAI / Knot
- **Observability System** — Built-in Trace/Span + OTel OTLP-compatible receiver
- **Online Evaluation** — Referenceless real-time evaluation without reference answers
- **Experiment System** — Multi-variable experiments (model / prompt / temperature / tool config)
- **Gene Store** — Store fix/optimization/innovation strategy prompt patches
- **Evolution Tracking** — Agent version iteration score trends
- **Python SDK & TypeScript SDK** — Dual-language SDK for quick integration
- **Docker One-Click Deploy** — Supports Linux / macOS / Windows
- **i18n** — English and Chinese UI
- Apache-2.0 LICENSE
- Complete README.md and CONTRIBUTING.md
- GitHub Actions CI/CD
- Issue & PR templates

### Security
- Environment variables templated, no hardcoded secrets
- .gitignore excludes all sensitive files
- CORS is configurable
- setup-database.sh supports environment variable password overrides
