-- ============================================================
-- Agent 评测平台 v5.0 数据库迁移
-- 新增: Score, AnnotationQueue, OnlineEvalConfig 表
-- 修改: EvalDimension 增加 requires_reference 字段
-- ============================================================

-- 1. Score 表（独立评分实体）
CREATE TABLE IF NOT EXISTS scores (
  id VARCHAR(36) PRIMARY KEY,
  trace_id VARCHAR(36) NOT NULL,
  span_id VARCHAR(36),
  name VARCHAR(100) NOT NULL,
  value FLOAT,
  string_value VARCHAR(200),
  comment TEXT,
  source VARCHAR(20) NOT NULL,
  author VARCHAR(100),
  eval_config_id VARCHAR(36),
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_scores_trace (trace_id),
  INDEX idx_scores_span (span_id),
  INDEX idx_scores_name (name),
  INDEX idx_scores_source (source),
  INDEX idx_scores_author (author),
  INDEX idx_scores_created (created_at),
  FOREIGN KEY (trace_id) REFERENCES traces(id) ON DELETE CASCADE
);

-- 2. AnnotationQueue 表（标注队列）
CREATE TABLE IF NOT EXISTS annotation_queues (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  filter_config JSON NOT NULL,
  score_configs JSON NOT NULL,
  assignees JSON,
  total_items INT DEFAULT 0,
  completed_items INT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active',
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_aq_status (status),
  INDEX idx_aq_created (created_at)
);

-- 3. OnlineEvalConfig 表（在线评估配置）
CREATE TABLE IF NOT EXISTS online_eval_configs (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  agent_ids JSON NOT NULL,
  dimensions JSON NOT NULL,
  judge_config_id VARCHAR(36) NOT NULL,   -- 模型配置 ID（物理列名保留 judge_config_id）
  sample_rate FLOAT DEFAULT 1.0,
  is_active BOOLEAN DEFAULT TRUE,
  alert_rules JSON,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_oec_active (is_active),
  INDEX idx_oec_created (created_at)
);

-- 4. EvalDimension 增加 requires_reference 字段
ALTER TABLE eval_dimensions ADD COLUMN IF NOT EXISTS requires_reference BOOLEAN DEFAULT TRUE;

-- 5. 标记不需要参考答案的维度
UPDATE eval_dimensions SET requires_reference = FALSE
WHERE name IN ('safety', 'hallucination', 'privacy', 'relevance', 'coherence', 'helpfulness', 'tone_style');
