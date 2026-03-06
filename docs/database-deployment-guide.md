# Agent 评测平台数据库部署指南

## 快速决策

### 🎯 推荐方案：先本地，再远程

| 阶段 | 部署位置 | 用途 | 成本 |
|------|---------|------|------|
| **现在（推荐）** | 本地 Docker | 开发和测试 | 免费 |
| 团队协作后 | 远程开发服务器 | 团队共享 | 低 |
| 生产上线后 | 远程生产服务器 | 正式运行 | 中 |

---

## 一、本地部署（推荐现在使用）

### 方案 1: Docker（最简单，推荐）

#### 1.1 安装 Docker

**macOS:**
```bash
brew install --cask docker
# 或下载 Docker Desktop: https://www.docker.com/products/docker-desktop
```

**Linux:**
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
```

**Windows:**
下载 Docker Desktop: https://www.docker.com/products/docker-desktop

#### 1.2 启动 MySQL 容器

```bash
# 创建数据目录
mkdir -p ~/agent-eval-data

# 启动 MySQL 8.0
docker run -d \
  --name agent-eval-mysql \
  -e MYSQL_ROOT_PASSWORD=agent_eval_2024 \
  -e MYSQL_DATABASE=agent_eval_platform \
  -e MYSQL_USER=agent_eval \
  -e MYSQL_PASSWORD=agent_eval_pass \
  -p 3306:3306 \
  -v ~/agent-eval-data:/var/lib/mysql \
  mysql:8.0 \
  --character-set-server=utf8mb4 \
  --collation-server=utf8mb4_unicode_ci

# 查看日志
docker logs -f agent-eval-mysql

# 等待 MySQL 启动完成（约 30 秒）
```

#### 1.3 验证安装

```bash
# 测试连接
docker exec -it agent-eval-mysql mysql -uagent_eval -pagent_eval_pass agent_eval_platform

# 或使用 mysql 客户端
mysql -h 127.0.0.1 -P 3306 -uagent_eval -pagent_eval_pass agent_eval_platform
```

#### 1.4 导入 Schema

```bash
cd /Users/caiwenzhe/codebuddy/20260212104448/agent-eval-platform/backend

# 导入数据库 Schema
docker exec -i agent-eval-mysql mysql -uagent_eval -pagent_eval_pass agent_eval_platform < migrations/mvp_schema.sql

# 验证表创建成功
docker exec -it agent-eval-mysql mysql -uagent_eval -pagent_eval_pass agent_eval_platform -e "SHOW TABLES;"
```

#### 1.5 配置环境变量

创建 `.env` 文件：

```bash
cd /Users/caiwenzhe/codebuddy/20260212104448/agent-eval-platform/backend

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
```

#### 1.6 Docker 常用命令

```bash
# 停止数据库
docker stop agent-eval-mysql

# 启动数据库
docker start agent-eval-mysql

# 重启数据库
docker restart agent-eval-mysql

# 删除容器（会保留数据）
docker rm agent-eval-mysql

# 完全删除（包括数据）
docker rm -v agent-eval-mysql
rm -rf ~/agent-eval-data
```

---

### 方案 2: 本地安装 MySQL

#### 2.1 安装 MySQL

**macOS:**
```bash
brew install mysql@8.0
brew services start mysql@8.0

# 设置 root 密码
mysql_secure_installation
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install mysql-server

# 启动服务
sudo systemctl start mysql
sudo systemctl enable mysql

# 安全配置
sudo mysql_secure_installation
```

**Windows:**
下载并安装 MySQL Installer: https://dev.mysql.com/downloads/installer/

#### 2.2 创建数据库和用户

```bash
mysql -u root -p

# 在 MySQL 命令行中执行
CREATE DATABASE agent_eval_platform CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'agent_eval'@'localhost' IDENTIFIED BY 'agent_eval_pass';

GRANT ALL PRIVILEGES ON agent_eval_platform.* TO 'agent_eval'@'localhost';

FLUSH PRIVILEGES;

EXIT;
```

#### 2.3 导入 Schema

```bash
cd /Users/caiwenzhe/codebuddy/20260212104448/agent-eval-platform/backend

mysql -u agent_eval -pagent_eval_pass agent_eval_platform < migrations/mvp_schema.sql

# 验证
mysql -u agent_eval -pagent_eval_pass agent_eval_platform -e "SHOW TABLES;"
```

---

## 二、使用 Prisma（推荐）

如果使用 Prisma ORM，可以更方便地管理数据库：

### 2.1 安装 Prisma

```bash
cd /Users/caiwenzhe/codebuddy/20260212104448/agent-eval-platform/backend

npm install prisma @prisma/client --save
# 或
pnpm add prisma @prisma/client
```

### 2.2 配置 Prisma

已经创建了 `prisma/schema.prisma` 文件，现在配置数据库连接：

```bash
# .env 文件已包含 DATABASE_URL
cat .env | grep DATABASE_URL
```

### 2.3 同步数据库

```bash
# 方式 1: 使用 Prisma Migrate（推荐）
npx prisma migrate dev --name init

# 方式 2: 直接推送 Schema（快速原型）
npx prisma db push

# 生成 Prisma Client
npx prisma generate
```

### 2.4 使用 Prisma Studio（可视化管理）

```bash
npx prisma studio
# 浏览器自动打开 http://localhost:5555
```

---

## 三、远程部署（团队协作阶段）

### 3.1 何时需要远程部署？

- ✅ 团队有 2+ 人需要共享数据
- ✅ 需要持久化的测试数据
- ✅ 需要模拟生产环境

### 3.2 远程部署选项

#### 选项 1: 云数据库服务（推荐）

**优点**: 自动备份、高可用、易管理

| 服务商 | 产品 | 免费额度 | 价格 |
|--------|------|---------|------|
| **AWS** | RDS MySQL | 750 小时/月（12 个月） | ~$15/月起 |
| **Google Cloud** | Cloud SQL | $0-300 试用 | ~$10/月起 |
| **阿里云** | RDS MySQL | 免费试用 | ~¥100/月起 |
| **腾讯云** | 云数据库 MySQL | 免费试用 | ~¥100/月起 |
| **PlanetScale** | Serverless MySQL | 免费 5GB | 免费/付费 |

**推荐：PlanetScale（开发阶段）**

```bash
# 安装 PlanetScale CLI
brew install planetscale/tap/pscale

# 登录
pscale auth login

# 创建数据库
pscale database create agent-eval-platform --region us-east

# 获取连接字符串
pscale connect agent-eval-platform main --port 3309

# 更新 .env
DATABASE_URL=mysql://root@127.0.0.1:3309/agent-eval-platform
```

#### 选项 2: 自建虚拟机

**适用场景**: 需要完全控制、已有服务器

**步骤**:

1. **准备虚拟机**
   ```bash
   # SSH 连接
   ssh user@your-server-ip
   ```

2. **安装 MySQL**
   ```bash
   sudo apt update
   sudo apt install mysql-server
   
   # 配置远程访问
   sudo nano /etc/mysql/mysql.conf.d/mysqld.cnf
   # 找到 bind-address = 127.0.0.1
   # 改为 bind-address = 0.0.0.0
   
   sudo systemctl restart mysql
   ```

3. **创建数据库和用户**
   ```sql
   CREATE DATABASE agent_eval_platform;
   CREATE USER 'agent_eval'@'%' IDENTIFIED BY 'strong_password_here';
   GRANT ALL PRIVILEGES ON agent_eval_platform.* TO 'agent_eval'@'%';
   FLUSH PRIVILEGES;
   ```

4. **配置防火墙**
   ```bash
   sudo ufw allow 3306/tcp
   ```

5. **安全建议**
   - 使用强密码
   - 只允许特定 IP 访问
   - 启用 SSL 连接
   - 定期备份

---

## 四、开发工作流

### 4.1 推荐的开发流程

```
┌─────────────────────────────────────────────┐
│ 开发者 A (本地 Docker)                       │
│   ↓                                          │
│ 开发功能 + 测试                               │
│   ↓                                          │
│ 提交代码到 Git                                │
└─────────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────┐
│ CI/CD (GitHub Actions)                      │
│   ↓                                          │
│ 自动测试 + 数据库迁移                         │
└─────────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────┐
│ 开发服务器（远程数据库）                      │
│   ↓                                          │
│ 团队共享环境                                  │
└─────────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────┐
│ 生产服务器（独立数据库）                      │
└─────────────────────────────────────────────┘
```

### 4.2 本地开发最佳实践

```bash
# 1. 启动本地数据库
docker start agent-eval-mysql

# 2. 检查数据库连接
npx prisma db pull  # 同步 Schema

# 3. 开发新功能
# ... 编写代码 ...

# 4. 测试数据库变更
npx prisma migrate dev --name add_new_feature

# 5. 运行测试
npm test

# 6. 提交代码
git add .
git commit -m "feat: add new feature"
git push
```

---

## 五、数据备份

### 5.1 本地数据库备份

```bash
# Docker MySQL 备份
docker exec agent-eval-mysql mysqldump \
  -uagent_eval -pagent_eval_pass agent_eval_platform \
  > backup_$(date +%Y%m%d_%H%M%S).sql

# 恢复
docker exec -i agent-eval-mysql mysql \
  -uagent_eval -pagent_eval_pass agent_eval_platform \
  < backup_20260224_150000.sql
```

### 5.2 自动备份脚本

```bash
cat > backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR=~/agent-eval-backups
mkdir -p $BACKUP_DIR

docker exec agent-eval-mysql mysqldump \
  -uagent_eval -pagent_eval_pass agent_eval_platform \
  > $BACKUP_DIR/backup_$(date +%Y%m%d_%H%M%S).sql

# 保留最近 7 天的备份
find $BACKUP_DIR -name "backup_*.sql" -mtime +7 -delete

echo "Backup completed: $(date)"
EOF

chmod +x backup.sh

# 添加到 crontab（每天凌晨 2 点备份）
# crontab -e
# 0 2 * * * /path/to/backup.sh >> /path/to/backup.log 2>&1
```

---

## 六、常见问题

### Q1: Docker MySQL 无法启动？

```bash
# 检查端口是否被占用
lsof -i :3306

# 停止占用端口的进程或更改端口
docker run -d \
  --name agent-eval-mysql \
  -p 3307:3306 \
  ...
```

### Q2: 连接被拒绝？

```bash
# 检查容器是否运行
docker ps

# 检查网络连接
docker exec agent-eval-mysql mysql -uroot -p -e "SELECT 1;"

# 检查防火墙
sudo ufw status
```

### Q3: Prisma 迁移失败？

```bash
# 重置数据库（开发阶段）
npx prisma migrate reset

# 手动同步
npx prisma db push --force-reset
```

### Q4: 数据库性能慢？

```bash
# 检查索引
SHOW INDEX FROM eval_results;

# 分析慢查询
SHOW VARIABLES LIKE 'slow_query_log';
SET GLOBAL slow_query_log = 'ON';
```

---

## 七、下一步

### ✅ 现在完成（本地部署）

1. **启动 Docker MySQL**（5 分钟）
2. **导入 Schema**（1 分钟）
3. **配置环境变量**（2 分钟）
4. **验证连接**（1 分钟）

### 📅 稍后完成（根据需要）

- 团队协作时：部署到远程开发服务器
- 生产上线前：配置生产数据库
- 性能优化：添加缓存、读写分离

---

## 八、快速开始脚本

创建一键启动脚本：

```bash
cat > setup-database.sh << 'EOF'
#!/bin/bash

echo "🚀 Agent 评测平台数据库安装脚本"
echo "================================"

# 检查 Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装，请先安装 Docker"
    exit 1
fi

echo "✅ Docker 已安装"

# 创建数据目录
mkdir -p ~/agent-eval-data

# 启动 MySQL
echo "📦 启动 MySQL 容器..."
docker run -d \
  --name agent-eval-mysql \
  -e MYSQL_ROOT_PASSWORD=agent_eval_2024 \
  -e MYSQL_DATABASE=agent_eval_platform \
  -e MYSQL_USER=agent_eval \
  -e MYSQL_PASSWORD=agent_eval_pass \
  -p 3306:3306 \
  -v ~/agent-eval-data:/var/lib/mysql \
  mysql:8.0 \
  --character-set-server=utf8mb4 \
  --collation-server=utf8mb4_unicode_ci

echo "⏳ 等待 MySQL 启动（30 秒）..."
sleep 30

# 导入 Schema
echo "📥 导入数据库 Schema..."
docker exec -i agent-eval-mysql mysql -uagent_eval -pagent_eval_pass agent_eval_platform < migrations/mvp_schema.sql

# 验证
echo "✅ 验证数据库..."
docker exec agent-eval-mysql mysql -uagent_eval -pagent_eval_pass agent_eval_platform -e "SHOW TABLES;"

echo ""
echo "🎉 数据库安装成功！"
echo ""
echo "📝 连接信息："
echo "   Host: localhost"
echo "   Port: 3306"
echo "   Database: agent_eval_platform"
echo "   User: agent_eval"
echo "   Password: agent_eval_pass"
echo ""
echo "📚 下一步："
echo "   1. 配置 .env 文件"
echo "   2. 运行后端服务: npm run dev"
echo ""

EOF

chmod +x setup-database.sh
```

**运行脚本**:
```bash
cd /Users/caiwenzhe/codebuddy/20260212104448/agent-eval-platform/backend
./setup-database.sh
```

---

**建议：现在使用 Docker 本地部署，快速开始开发！**
