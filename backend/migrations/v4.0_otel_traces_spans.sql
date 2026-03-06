-- ============================================================
-- v4.0 Migration: OTel 可观测性 - Traces & Spans 表
-- 替代 Langfuse 依赖，实现本地 Trace/Span 存储
-- ============================================================

-- 12. Trace（可观测性 - 调用追踪）
CREATE TABLE IF NOT EXISTS `traces` (
  `id` VARCHAR(191) NOT NULL,
  `agent_id` VARCHAR(191) NULL,
  `source` VARCHAR(20) NOT NULL DEFAULT 'eval',
  `name` VARCHAR(500) NOT NULL,
  `input` LONGTEXT NULL,
  `output` LONGTEXT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'ok',
  `total_latency_ms` INTEGER NULL,
  `total_tokens` INTEGER NULL DEFAULT 0,
  `prompt_tokens` INTEGER NULL DEFAULT 0,
  `completion_tokens` INTEGER NULL DEFAULT 0,
  `total_cost` DOUBLE NULL DEFAULT 0,
  `llm_call_count` INTEGER NOT NULL DEFAULT 0,
  `tool_call_count` INTEGER NOT NULL DEFAULT 0,
  `session_id` VARCHAR(200) NULL,
  `user_id` VARCHAR(200) NULL,
  `metadata` JSON NULL,
  `tags` JSON NULL,
  `start_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `end_time` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  INDEX `traces_agent_id_idx` (`agent_id`),
  INDEX `traces_source_idx` (`source`),
  INDEX `traces_status_idx` (`status`),
  INDEX `traces_session_id_idx` (`session_id`),
  INDEX `traces_user_id_idx` (`user_id`),
  INDEX `traces_start_time_idx` (`start_time`),
  INDEX `traces_created_at_idx` (`created_at`),
  CONSTRAINT `traces_agent_id_fkey` FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


-- 13. Span（可观测性 - 调用链节点）
CREATE TABLE IF NOT EXISTS `spans` (
  `id` VARCHAR(191) NOT NULL,
  `trace_id` VARCHAR(191) NOT NULL,
  `parent_span_id` VARCHAR(191) NULL,
  `name` VARCHAR(500) NOT NULL,
  `kind` VARCHAR(20) NOT NULL DEFAULT 'other',
  `status` VARCHAR(20) NOT NULL DEFAULT 'ok',
  `status_message` TEXT NULL,
  `start_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `end_time` DATETIME(3) NULL,
  `latency_ms` INTEGER NULL,

  -- LLM 特有属性
  `llm_model` VARCHAR(200) NULL,
  `llm_prompt` LONGTEXT NULL,
  `llm_completion` LONGTEXT NULL,
  `llm_prompt_tokens` INTEGER NULL,
  `llm_completion_tokens` INTEGER NULL,
  `llm_total_tokens` INTEGER NULL,
  `llm_temperature` DOUBLE NULL,
  `llm_cost` DOUBLE NULL,
  `llm_finish_reason` VARCHAR(50) NULL,

  -- 工具调用特有属性
  `tool_name` VARCHAR(200) NULL,
  `tool_input` LONGTEXT NULL,
  `tool_output` LONGTEXT NULL,
  `tool_status` VARCHAR(20) NULL,

  -- 检索特有属性
  `retrieval_query` TEXT NULL,
  `retrieval_doc_count` INTEGER NULL,
  `retrieval_documents` JSON NULL,

  -- 通用输入/输出
  `input` LONGTEXT NULL,
  `output` LONGTEXT NULL,

  -- 扩展属性
  `attributes` JSON NULL,
  `events` JSON NULL,

  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `spans_trace_id_idx` (`trace_id`),
  INDEX `spans_parent_span_id_idx` (`parent_span_id`),
  INDEX `spans_kind_idx` (`kind`),
  INDEX `spans_status_idx` (`status`),
  INDEX `spans_llm_model_idx` (`llm_model`),
  INDEX `spans_tool_name_idx` (`tool_name`),
  INDEX `spans_start_time_idx` (`start_time`),
  INDEX `spans_created_at_idx` (`created_at`),
  CONSTRAINT `spans_trace_id_fkey` FOREIGN KEY (`trace_id`) REFERENCES `traces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `spans_parent_span_id_fkey` FOREIGN KEY (`parent_span_id`) REFERENCES `spans`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


-- 给 eval_results 表添加 trace_id 字段
ALTER TABLE `eval_results` ADD COLUMN `trace_id` VARCHAR(191) NULL;
ALTER TABLE `eval_results` ADD INDEX `eval_results_trace_id_idx` (`trace_id`);
ALTER TABLE `eval_results` ADD CONSTRAINT `eval_results_trace_id_fkey` FOREIGN KEY (`trace_id`) REFERENCES `traces`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
