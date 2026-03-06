# Contributing to Agent Eval Platform

感谢你对 Agent Eval Platform 的贡献兴趣！

## 开发环境搭建

### 前置要求

- Python 3.12+
- Node.js 20+
- MySQL 8.0（或通过 Docker Compose）

### 快速启动

```bash
# 1. 克隆项目
git clone <repo-url>
cd agent-eval-platform

# 2. 复制环境变量
cp .env.example .env
# 编辑 .env 填入 JUDGE_LLM_API_KEY

# 3. 启动数据库
docker compose up mysql -d

# 4. 后端开发
cd backend
pip install -r requirements.txt
pip install -r requirements-dev.txt
npx prisma generate
npx prisma db push
python -m uvicorn main:app --reload

# 5. 前端开发
cd frontend
npm install
npm run dev
```

## 分支命名

- `feat/xxx` — 新功能
- `fix/xxx` — Bug 修复
- `refactor/xxx` — 重构
- `docs/xxx` — 文档
- `test/xxx` — 测试

## Commit 规范

遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

```
feat: 新增结构化评分器
fix: 修复 eval_engine 并发安全问题
refactor: 重构 scoring_engine Phase 3 分流
test: 添加 structured_scorer 单元测试
docs: 更新 CONTRIBUTING.md
```

## 代码风格

- **Python**：使用 `ruff` 进行格式化和检查（配置见 `backend/ruff.toml`）
- **TypeScript**：使用 `eslint` + `prettier`
- **Pre-commit**：安装 `pre-commit install` 自动检查

## 测试

```bash
# 后端测试
cd backend && python -m pytest

# 前端测试
cd frontend && npx vitest run
```

## Pull Request 流程

1. 从 `main` 创建功能分支
2. 完成开发和测试
3. 确保 CI 通过
4. 提交 PR，填写模板
5. 等待 Code Review
