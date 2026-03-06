#!/bin/bash

echo "EvalMind Database Setup Script"
echo "================================"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker is not installed"
    echo ""
    echo "Please install Docker first:"
    echo "  macOS: brew install --cask docker"
    echo "  Linux: curl -fsSL https://get.docker.com -o get-docker.sh && sudo sh get-docker.sh"
    echo "  Or visit: https://www.docker.com/products/docker-desktop"
    exit 1
fi

echo "OK: Docker is installed"

# Check Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "ERROR: Docker is not running. Please start Docker Desktop."
    exit 1
fi

echo "OK: Docker is running"

# Create data directory
echo "Creating data directory..."
mkdir -p ~/agent-eval-data

# Check if container already exists
if docker ps -a | grep -q agent-eval-mysql; then
    echo "WARNING: Existing container detected"
    read -p "Delete and recreate? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Removing old container..."
        docker rm -f agent-eval-mysql
    else
        echo "Cancelled."
        exit 1
    fi
fi

# Start MySQL
echo "Starting MySQL container..."
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
    echo "ERROR: Failed to start MySQL container"
    echo ""
    echo "Common issues:"
    echo "  1. Port 3306 is already in use: lsof -i :3306"
    echo "  2. Docker permission issue: check Docker Desktop settings"
    exit 1
fi

echo "OK: MySQL container started"

# Wait for MySQL to be ready
echo "Waiting for MySQL to initialize..."
for i in {1..30}; do
    if docker exec agent-eval-mysql mysqladmin ping -h localhost --silent > /dev/null 2>&1; then
        echo "OK: MySQL is ready"
        break
    fi
    echo -n "."
    sleep 1
done
echo ""

# Verify connection
if ! docker exec agent-eval-mysql mysql -uagent_eval -pagent_eval_pass -e "SELECT 1;" > /dev/null 2>&1; then
    echo "ERROR: Database connection failed"
    exit 1
fi

echo "OK: Database connection successful"

# Import Schema
if [ -f "migrations/mvp_schema.sql" ]; then
    echo "Importing database schema..."
    docker exec -i agent-eval-mysql mysql -uagent_eval -pagent_eval_pass agent_eval_platform < migrations/mvp_schema.sql
    
    if [ $? -eq 0 ]; then
        echo "OK: Schema imported successfully"
    else
        echo "WARNING: Schema import failed, please check manually"
    fi
else
    echo "WARNING: migrations/mvp_schema.sql not found, skipping import"
fi

# Verify tables
echo "Verifying database tables..."
TABLE_COUNT=$(docker exec agent-eval-mysql mysql -uagent_eval -pagent_eval_pass agent_eval_platform -se "SHOW TABLES;" | wc -l)
echo "   Created $TABLE_COUNT tables"

if [ $TABLE_COUNT -gt 0 ]; then
    docker exec agent-eval-mysql mysql -uagent_eval -pagent_eval_pass agent_eval_platform -e "SHOW TABLES;"
fi

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    cat > .env << 'EOF'
# Database configuration
DATABASE_URL=mysql://agent_eval:agent_eval_pass@localhost:3306/agent_eval_platform

# Judge LLM configuration (replace with your actual API key)
JUDGE_LLM_BASE_URL=https://api.openai.com/v1
JUDGE_LLM_API_KEY=your-openai-api-key-here
JUDGE_LLM_MODEL=gpt-4o

# Application configuration
PORT=8000
NODE_ENV=development
EOF
    echo "OK: .env file created"
    echo "NOTE: Please edit .env and replace JUDGE_LLM_API_KEY with your actual key"
else
    echo "INFO: .env file already exists, skipping creation"
fi

echo ""
echo "==================================="
echo "Database setup complete!"
echo "==================================="
echo ""
echo "Connection info:"
echo "   Host:     localhost"
echo "   Port:     3306"
echo "   Database: agent_eval_platform"
echo "   User:     agent_eval"
echo "   Password: agent_eval_pass"
echo ""
echo "Useful commands:"
echo "   View logs: docker logs -f agent-eval-mysql"
echo "   Stop:      docker stop agent-eval-mysql"
echo "   Start:     docker start agent-eval-mysql"
echo "   Restart:   docker restart agent-eval-mysql"
echo "   Connect:   docker exec -it agent-eval-mysql mysql -uagent_eval -pagent_eval_pass agent_eval_platform"
echo ""
echo "Next steps:"
echo "   1. Edit .env and replace the API key"
echo "   2. Install dependencies: pip install -r requirements.txt"
echo "   3. Generate Prisma Client: npx prisma generate"
echo "   4. Push schema to database: npx prisma db push"
echo "   5. Start backend: uvicorn main:app --reload --host 0.0.0.0 --port 8000"
echo ""
