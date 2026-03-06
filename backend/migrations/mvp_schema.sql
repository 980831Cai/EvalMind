-- ============================================================
-- Agent 评测平台 MVP 数据库 Schema
-- ============================================================
-- 版本: 1.0.0
-- 日期: 2026-02-24
-- 说明: MVP 最小可行产品数据库设计（5 个核心表）
-- ============================================================

-- ============================================================
-- 1. 模型配置表
-- ============================================================
-- 说明: 存储模型 LLM 的配置（单表，全局配置）
CREATE TABLE IF NOT EXISTS judge_config (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    
    -- 基础配置
    provider VARCHAR(50) NOT NULL COMMENT '提供商: openai, deepseek, anthropic, ollama',
    model_name VARCHAR(100) NOT NULL COMMENT '模型名称: gpt-4o, deepseek-chat 等',
    base_url VARCHAR(500) NOT NULL COMMENT 'API 基础 URL',
    api_key VARCHAR(500) NOT NULL COMMENT 'API Key（加密存储）',
    
    -- 模型参数
    temperature DECIMAL(3,2) DEFAULT 0.3 COMMENT '温度参数 0.0-1.0',
    max_tokens INT DEFAULT 2048 COMMENT '最大生成 tokens',
    top_p DECIMAL(3,2) DEFAULT 1.0 COMMENT 'Top-p 采样参数',
    
    -- 其他配置
    config JSON COMMENT '其他配置参数（JSON 格式）',
    
    -- 状态
    is_active BOOLEAN DEFAULT TRUE COMMENT '是否启用',
    last_tested_at TIMESTAMP NULL COMMENT '最后测试时间',
    test_status VARCHAR(20) COMMENT '测试状态: success, failed',
    
    -- 时间戳
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_is_active (is_active),
    INDEX idx_provider (provider)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Judge LLM 配置表';

-- ============================================================
-- 2. Agent 配置表
-- ============================================================
-- 说明: 存储要评测的 Agent 配置
CREATE TABLE IF NOT EXISTS agents (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    
    -- 基础信息
    name VARCHAR(200) NOT NULL COMMENT 'Agent 名称',
    description TEXT COMMENT 'Agent 描述',
    
    -- Agent 配置
    system_prompt TEXT NOT NULL COMMENT '系统提示词',
    skills JSON NOT NULL COMMENT 'Skills 列表 [{"name": "web_search", "description": "..."}]',
    
    -- 元数据
    tags JSON COMMENT '标签数组',
    metadata JSON COMMENT '自定义元数据',
    
    -- 时间戳
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_name (name),
    INDEX idx_created_at (created_at),
    FULLTEXT idx_description (description)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Agent 配置表';

-- ============================================================
-- 3. 测试套件表
-- ============================================================
-- 说明: 存储测试套件和测试用例（合并 Dataset + DatasetItem）
CREATE TABLE IF NOT EXISTS test_suites (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    
    -- 基础信息
    name VARCHAR(200) NOT NULL COMMENT '测试套件名称',
    description TEXT COMMENT '描述',
    
    -- 测试用例
    test_cases JSON NOT NULL COMMENT '测试用例数组 [{"id": "tc_001", "input": "...", "expected_output": "...", "metadata": {...}}]',
    
    -- 统计信息
    total_cases INT GENERATED ALWAYS AS (JSON_LENGTH(test_cases)) STORED COMMENT '测试用例总数',
    
    -- 元数据
    tags JSON COMMENT '标签',
    source VARCHAR(50) DEFAULT 'manual' COMMENT '来源: manual, imported, generated',
    
    -- 时间戳
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_name (name),
    INDEX idx_source (source),
    INDEX idx_created_at (created_at),
    FULLTEXT idx_description (description)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='测试套件表';

-- ============================================================
-- 4. 评测运行表
-- ============================================================
-- 说明: 存储评测任务的执行信息
CREATE TABLE IF NOT EXISTS eval_runs (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    
    -- 关联关系
    agent_id VARCHAR(36) NOT NULL COMMENT '关联的 Agent ID',
    test_suite_id VARCHAR(36) NOT NULL COMMENT '关联的测试套件 ID',
    
    -- 配置快照（用于历史追溯）
    agent_snapshot JSON NOT NULL COMMENT 'Agent 配置快照',
    test_suite_snapshot JSON NOT NULL COMMENT '测试套件快照',
    
    -- 评测配置
    dimensions JSON NOT NULL COMMENT '评分维度 ["accuracy", "helpfulness"]',
    concurrency INT DEFAULT 5 COMMENT '并发数',
    timeout INT DEFAULT 60 COMMENT '超时时间（秒）',
    
    -- 执行状态
    status ENUM('pending', 'running', 'completed', 'failed', 'cancelled') DEFAULT 'pending' COMMENT '状态',
    progress INT DEFAULT 0 COMMENT '进度 0-100',
    current_item INT DEFAULT 0 COMMENT '当前执行的测试用例序号',
    total_items INT DEFAULT 0 COMMENT '总测试用例数',
    
    -- 结果摘要
    passed_count INT DEFAULT 0 COMMENT '通过数量',
    failed_count INT DEFAULT 0 COMMENT '失败数量',
    average_score DECIMAL(5,2) COMMENT '平均分 0-100',
    
    -- 错误信息
    error_message TEXT COMMENT '错误信息',
    
    -- 时间戳
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP NULL COMMENT '开始时间',
    completed_at TIMESTAMP NULL COMMENT '完成时间',
    
    -- 外键
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
    FOREIGN KEY (test_suite_id) REFERENCES test_suites(id) ON DELETE CASCADE,
    
    INDEX idx_agent_id (agent_id),
    INDEX idx_test_suite_id (test_suite_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='评测运行表';

-- ============================================================
-- 5. 评测结果表
-- ============================================================
-- 说明: 存储每个测试用例的评测结果
CREATE TABLE IF NOT EXISTS eval_results (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    
    -- 关联关系
    eval_run_id VARCHAR(36) NOT NULL COMMENT '关联的评测运行 ID',
    test_case_id VARCHAR(36) NOT NULL COMMENT '测试用例 ID',
    
    -- 测试用例信息
    input TEXT NOT NULL COMMENT '输入（快照）',
    expected_output TEXT COMMENT '期望输出（快照）',
    
    -- Agent 输出
    agent_output TEXT COMMENT 'Agent 的输出',
    agent_thinking TEXT COMMENT 'Agent 的思考过程',
    
    -- Skills 使用记录
    skills_called JSON COMMENT 'Skills 调用记录 [{"skill": "web_search", "params": {...}, "result": {...}}]',
    
    -- 评分
    scores JSON NOT NULL COMMENT '各维度评分 {"accuracy": 0.85, "helpfulness": 0.90}',
    overall_score DECIMAL(5,2) NOT NULL COMMENT '总分 0-100',
    passed BOOLEAN NOT NULL COMMENT '是否通过',
    
    -- 评分理由
    reasoning TEXT COMMENT '评分理由',
    
    -- 执行信息
    latency_ms INT COMMENT '响应延迟（毫秒）',
    token_usage JSON COMMENT 'Token 使用量 {"prompt": 100, "completion": 200}',
    
    -- 错误信息
    error_message TEXT COMMENT '错误信息',
    
    -- 时间戳
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- 外键
    FOREIGN KEY (eval_run_id) REFERENCES eval_runs(id) ON DELETE CASCADE,
    
    INDEX idx_eval_run_id (eval_run_id),
    INDEX idx_test_case_id (test_case_id),
    INDEX idx_passed (passed),
    INDEX idx_overall_score (overall_score),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='评测结果表';

-- ============================================================
-- 初始化数据
-- ============================================================

-- 插入默认模型配置（示例）
INSERT INTO judge_config (
    provider,
    model_name,
    base_url,
    api_key,
    temperature,
    max_tokens,
    is_active
) VALUES (
    'openai',
    'gpt-4o',
    'https://api.openai.com/v1',
    'your-api-key-here',  -- 需要替换为实际 API Key
    0.3,
    2048,
    TRUE
) ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;

-- ============================================================
-- 性能优化
-- ============================================================

-- 为 JSON 字段添加虚拟列和索引（MySQL 5.7.8+）
-- 如果需要频繁按 skills 查询 Agent
ALTER TABLE agents ADD COLUMN skills_count INT GENERATED ALWAYS AS (JSON_LENGTH(skills)) STORED;
CREATE INDEX idx_skills_count ON agents(skills_count);

-- 如果需要频繁按标签查询
-- ALTER TABLE agents ADD COLUMN tag_array JSON GENERATED ALWAYS AS (JSON_EXTRACT(tags, '$')) STORED;

-- ============================================================
-- 数据完整性检查触发器
-- ============================================================

DELIMITER $$

-- 触发器: 更新 eval_run 的摘要信息
CREATE TRIGGER update_eval_run_summary
AFTER INSERT ON eval_results
FOR EACH ROW
BEGIN
    UPDATE eval_runs
    SET 
        passed_count = passed_count + IF(NEW.passed = TRUE, 1, 0),
        failed_count = failed_count + IF(NEW.passed = FALSE, 1, 0),
        current_item = current_item + 1,
        progress = ROUND((current_item / total_items) * 100),
        average_score = (
            SELECT AVG(overall_score)
            FROM eval_results
            WHERE eval_run_id = NEW.eval_run_id
        )
    WHERE id = NEW.eval_run_id;
END$$

-- 触发器: 自动完成评测任务
CREATE TRIGGER complete_eval_run
AFTER UPDATE ON eval_runs
FOR EACH ROW
BEGIN
    IF NEW.current_item = NEW.total_items AND NEW.status = 'running' THEN
        UPDATE eval_runs
        SET 
            status = 'completed',
            completed_at = CURRENT_TIMESTAMP
        WHERE id = NEW.id;
    END IF;
END$$

DELIMITER ;

-- ============================================================
-- 视图：方便查询
-- ============================================================

-- 视图：评测运行详情
CREATE OR REPLACE VIEW eval_runs_detail AS
SELECT 
    er.id,
    er.status,
    er.progress,
    er.passed_count,
    er.failed_count,
    er.average_score,
    er.created_at,
    er.started_at,
    er.completed_at,
    a.id AS agent_id,
    a.name AS agent_name,
    ts.id AS test_suite_id,
    ts.name AS test_suite_name,
    ts.total_cases,
    TIMESTAMPDIFF(SECOND, er.started_at, COALESCE(er.completed_at, CURRENT_TIMESTAMP)) AS duration_seconds
FROM eval_runs er
JOIN agents a ON er.agent_id = a.id
JOIN test_suites ts ON er.test_suite_id = ts.id;

-- 视图：Agent 评测统计
CREATE OR REPLACE VIEW agent_stats AS
SELECT 
    a.id,
    a.name,
    COUNT(er.id) AS total_runs,
    AVG(er.average_score) AS avg_score,
    MAX(er.created_at) AS last_run_at
FROM agents a
LEFT JOIN eval_runs er ON a.id = er.agent_id AND er.status = 'completed'
GROUP BY a.id, a.name;

-- ============================================================
-- 说明文档
-- ============================================================

/*
MVP 数据库设计说明
==================

1. 设计原则
   - 简化优先：5 个核心表，避免过度设计
   - 性能优化：合理的索引、触发器、视图
   - 可扩展性：JSON 字段预留扩展空间
   - 数据完整性：外键约束、触发器

2. 核心表说明
   - judge_config: 模型配置表，存储通用 LLM 配置
   - agents: Agent 配置，skills 使用 JSON 存储
   - test_suites: 测试套件，test_cases 使用 JSON 数组
   - eval_runs: 评测任务，包含配置快照
   - eval_results: 评测结果，每个测试用例一条记录

3. JSON 字段设计
   - skills: [{"name": "web_search", "description": "..."}]
   - test_cases: [{"id": "tc_001", "input": "...", "expected_output": "..."}]
   - scores: {"accuracy": 0.85, "helpfulness": 0.90}
   - skills_called: [{"skill": "web_search", "params": {...}}]

4. 性能考虑
   - 添加了合理的索引
   - 使用触发器自动更新摘要信息
   - 创建视图简化常用查询
   - JSON 字段添加虚拟列和索引（可选）

5. 扩展点
   - judge_config.config: 其他配置参数
   - agents.metadata: 自定义元数据
   - test_suites 可以后续拆分为独立的 test_cases 表
   - eval_results 的详细日志可以外置对象存储

6. 数据迁移
   - 如果从现有系统迁移，需要编写转换脚本
   - 主要转换：Dataset + DatasetItem → test_suites
   - EvalTask + EvalResult → eval_runs + eval_results

7. 后续优化（Phase 2）
   - 添加 test_case_generations 表（记录生成历史）
   - 添加 eval_reports 表（汇总报告）
   - 拆分 test_suites 为独立的 test_cases 表
   - 添加版本控制字段
*/
