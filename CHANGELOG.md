# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [6.0.0] - 2026-03-06

### Added
- **Open Source Release** — 首次公开开源发布
- **20+ 页面** — 完整的 React 前端 UI（仪表盘、评测中心、Traces、实验、对比等）
- **评测引擎 v6** — 支持单轮/多轮对话、Pass@K、并发执行
- **4 种评分方法** — LLM-as-Judge / G-Eval / Rule Tree / Structured Scorer
- **16 种确定性断言** — contains / regex_match / json_valid / tool_called 等
- **Multi-Judge 共识评分** — 多 LLM 并发评分取中位数
- **3 种 Agent 适配器** — HTTP / OpenAI / Knot
- **可观测性系统** — 内置 Trace/Span + OTel OTLP 兼容接收器
- **在线评估** — Referenceless 无参考答案实时评估
- **实验系统** — 多变量实验（模型/Prompt/温度/工具配置）
- **策略基因库** — 存储修复/优化/创新策略 Prompt 补丁
- **进化追踪** — Agent 版本迭代分数趋势
- **Python SDK & TypeScript SDK** — 双语 SDK 快速接入
- **Docker 一键部署** — 支持 Linux / macOS / Windows
- **国际化** — 中英双语 UI
- Apache-2.0 LICENSE
- 完整的 README.md、CONTRIBUTING.md
- GitHub Actions CI/CD
- Issue & PR 模板

### Security
- 环境变量模板化，无硬编码密钥
- .gitignore 排除所有敏感文件
- CORS 可配置
- setup-database.sh 支持环境变量覆盖密码
