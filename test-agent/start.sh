#!/bin/bash
# 启动测试 Agent 服务器
# 用法: ./start.sh [port]

PORT=${1:-8900}
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "============================================"
echo "  启动测试 Agent 服务器"
echo "  端口: $PORT"
echo "============================================"
echo ""

# 安装依赖
echo ">>> 安装依赖..."
pip install -q -r "$SCRIPT_DIR/requirements.txt"
echo ""

# 启动服务
echo ">>> 启动 Agent 服务 (端口 $PORT)..."
echo "    HTTP 接口:   http://localhost:$PORT/api/chat"
echo "    OpenAI 接口: http://localhost:$PORT/v1/chat/completions"
echo "    健康检查:    http://localhost:$PORT/health"
echo ""

cd "$SCRIPT_DIR"
uvicorn agent_server:app --host 0.0.0.0 --port "$PORT" --reload
