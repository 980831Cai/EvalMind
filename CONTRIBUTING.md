# Contributing to EvalMind

Thanks for your interest in contributing to EvalMind!

## Development Setup

### Prerequisites

- Python 3.12+
- Node.js 20+
- MySQL 8.0

### Quick Start

```bash
# 1. Clone the project
git clone https://github.com/980831Cai/EvalMind.git
cd EvalMind

# 2. Copy environment variables
cp .env.example .env
# Edit .env — fill in JUDGE_LLM_API_KEY

# 3. Set up the database
cd backend
bash setup-database.sh

# 4. Backend development
pip install -r requirements.txt
pip install -r requirements-dev.txt
npx prisma generate
npx prisma db push
python -m uvicorn main:app --reload

# 5. Frontend development (new terminal)
cd frontend
npm install
npm run dev
```

## Branch Naming

- `feat/xxx` — New feature
- `fix/xxx` — Bug fix
- `refactor/xxx` — Refactoring
- `docs/xxx` — Documentation
- `test/xxx` — Tests

## Commit Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add structured scorer
fix: resolve eval_engine concurrency issue
refactor: restructure scoring_engine phase 3 routing
test: add structured_scorer unit tests
docs: update CONTRIBUTING.md
```

## Code Style

- **Python**: Use `ruff` for formatting and linting (config in `backend/ruff.toml`)
- **TypeScript**: Use `eslint` + `prettier`
- **Pre-commit**: Run `pre-commit install` for automatic checks

## Testing

```bash
# Backend tests
cd backend && python -m pytest

# Frontend tests
cd frontend && npx vitest run
```

## Pull Request Process

1. Create a feature branch from `main`
2. Complete development and testing
3. Ensure CI passes
4. Submit a PR using the template
5. Wait for code review
