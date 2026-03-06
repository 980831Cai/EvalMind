#!/bin/bash

echo "🚀 Agent 评测平台数据库安装脚本"
echo "================================"

# 检查 Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装"
    echo ""
    echo "请先安装 Docker:"
    echo "  macOS: brew install --cask docker"
    echo "  Linux: curl -fsSL https://get.docker.com -o get-docker.sh && sudo sh get-docker.sh"
    echo "  或访问: https://www.docker.com/products/docker-desktop"
    exit 1
fi

echo "✅ Docker 已安装"

# 检查 Docker 是否运行
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker 未运行，请启动 Docker Desktop"
    exit 1
fi

echo "✅ Docker 正在运行"

# 创建数据目录
echo "📁 创建数据目录..."
mkdir -p ~/agent-eval-data

# 检查容器是否已存在
if docker ps -a | grep -q agent-eval-mysql; then
    echo "⚠️  检测到已存在的容器"
    read -p "是否删除并重新创建？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🗑️  删除旧容器..."
        docker rm -f agent-eval-mysql
    else
        echo "❌ 已取消"
        exit 1
    fi
fi

# 启动 MySQL
echo "📦 启动 MySQL 容器..."
MYSQL_ROOT_PWD=${MYSQL_ROOT_PASSWORD:-agent_eval_2024}
MYSQL_DB=${MYSQL_DATABASE:-agent_eval_platform}
MYSQL_USR=${MYSQL_USER:-agent_eval}
MYSQL_PWD=${MYSQL_PASSWORD:-agent_eval_pass}

docker run -d \
  --name agent-eval-mysql \
  -e MYSQL_ROOT_PASSWORD="$MYSQL_ROOT_PWD" \
  -e MYSQL_DATABASE="$MYSQL_DB" \
  -e MYSQL_USER="$MYSQL_USR" \
  -e MYSQL_PASSWORD="$MYSQL_PWD" \
  -p 3306:3306 \
  -v ~/agent-eval-data:/var/lib/mysql \
  --restart unless-stopped \
  mysql:8.0 \
  --character-set-server=utf8mb4 \
  --collation-server=utf8mb4_unicode_ci

if [ $? -ne 0 ]; then
    echo "❌ MySQL 容器启动失败"
    echo ""
    echo "常见问题："
    echo "  1. 端口 3306 被占用：lsof -i :3306"
    echo "  2. Docker 没有权限：检查 Docker Desktop 设置"
    exit 1
fi

echo "✅ MySQL 容器已启动"

# 等待 MySQL 启动
echo "⏳ 等待 MySQL 初始化..."
for i in {1..30}; do
    if docker exec agent-eval-mysql mysqladmin ping -h localhost --silent > /dev/null 2>&1; then
        echo "✅ MySQL 已就绪"
        break
    fi
    echo -n "."
    sleep 1
done
echo ""

# 验证连接
if ! docker exec agent-eval-mysql mysql -uagent_eval -pagent_eval_pass -e "SELECT 1;" > /dev/null 2>&1; then
    echo "❌ 数据库连接失败"
    exit 1
fi

echo "✅ 数据库连接成功"

# 导入 Schema
if [ -f "migrations/mvp_schema.sql" ]; then
    echo "📥 导入数据库 Schema..."
    docker exec -i agent-eval-mysql mysql -uagent_eval -pagent_eval_pass agent_eval_platform < migrations/mvp_schema.sql
    
    if [ $? -eq 0 ]; then
        echo "✅ Schema 导入成功"
    else
        echo "⚠️  Schema 导入失败，请手动检查"
    fi
else
    echo "⚠️  未找到 migrations/mvp_schema.sql，跳过导入"
fi

# 验证表创建
echo "📊 验证数据库表..."
TABLE_COUNT=$(docker exec agent-eval-mysql mysql -uagent_eval -pagent_eval_pass agent_eval_platform -se "SHOW TABLES;" | wc -l)
echo "   已创建 $TABLE_COUNT 个表"

if [ $TABLE_COUNT -gt 0 ]; then
    docker exec agent-eval-mysql mysql -uagent_eval -pagent_eval_pass agent_eval_platform -e "SHOW TABLES;"
fi

# 创建 .env 文件（如果不存在）
if [ ! -f ".env" ]; then
    echo "📝 创建 .env 文件..."
    cat > .env << 'EOF'
# 数据库配置
DATABASE_URL=mysql://agent_eval:agent_eval_pass@localhost:3306/agent_eval_platform

# Judge LLM 配置（需要替换为实际的 API Key）
JUDGE_LLM_BASE_URL=https://api.openai.com/v1
JUDGE_LLM_API_KEY=your-openai-api-key-here
JUDGE_LLM_MODEL=gpt-4o

# 应用配置
PORT=8000
NODE_ENV=development
EOF
    echo "✅ .env 文件已创建"
    echo "⚠️  请编辑 .env 文件，替换 JUDGE_LLM_API_KEY"
else
    echo "ℹ️  .env 文件已存在，跳过创建"
fi

echo ""
echo "═══════════════════════════════════"
echo "🎉 数据库安装成功！"
echo "═══════════════════════════════════"
echo ""
echo "📝 连接信息："
echo "   Host:     localhost"
echo "   Port:     3306"
echo "   Database: agent_eval_platform"
echo "   User:     agent_eval"
echo "   Password: agent_eval_pass"
echo ""
echo "🔧 常用命令："
echo "   查看日志: docker logs -f agent-eval-mysql"
echo "   停止:     docker stop agent-eval-mysql"
echo "   启动:     docker start agent-eval-mysql"
echo "   重启:     docker restart agent-eval-mysql"
echo "   连接:     docker exec -it agent-eval-mysql mysql -uagent_eval -pagent_eval_pass agent_eval_platform"
echo ""
echo "📚 下一步："
echo "   1. 编辑 .env 文件，替换 API Key"
echo "   2. 安装依赖: npm install 或 pnpm install"
echo "   3. 生成 Prisma Client: npx prisma generate"
echo "   4. 运行后端服务: npm run dev"
echo ""
