# ==============================
# Stage 1: Build Frontend
# ==============================
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install --frozen-lockfile 2>/dev/null || npm install
COPY frontend/ ./
RUN npm run build

# ==============================
# Stage 2: Build Backend
# ==============================
FROM python:3.12-slim AS backend

WORKDIR /app

# Install system deps for prisma/re2
RUN apt-get update && apt-get install -y --no-install-recommends \
    nodejs npm libre2-dev && \
    rm -rf /var/lib/apt/lists/*

# Install Python deps
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ ./backend/

# Copy frontend build output
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Generate Prisma client
WORKDIR /app/backend
RUN npx prisma generate

# Expose port
EXPOSE 8000

# Health check (using Python urllib to avoid curl dependency)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/dashboard')" || exit 1

# Start the backend (which also serves frontend static files)
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
