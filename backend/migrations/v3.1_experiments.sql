-- ============================================================
-- v3.1 Migration: 实验系统 + Dataset版本化
-- 日期: 2026-02-27
-- ============================================================

-- 1. 新增实验表
CREATE TABLE IF NOT EXISTS `experiments` (
  `id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `description` TEXT,
  `agent_id` VARCHAR(36) NOT NULL,
  `test_suite_id` VARCHAR(36) NOT NULL,
  `variables` JSON NOT NULL,
  `eval_run_ids` JSON DEFAULT ('[]'),
  `result_matrix` JSON,
  `dimensions` JSON,
  `judge_config_id` VARCHAR(36),
  `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
  `total_combinations` INT NOT NULL DEFAULT 0,
  `completed_combinations` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_experiments_agent_id` (`agent_id`),
  INDEX `idx_experiments_test_suite_id` (`test_suite_id`),
  INDEX `idx_experiments_status` (`status`),
  INDEX `idx_experiments_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. 测试套件版本化字段
ALTER TABLE `test_suites`
  ADD COLUMN `version` INT NOT NULL DEFAULT 1 AFTER `test_cases`,
  ADD COLUMN `parent_id` VARCHAR(36) NULL AFTER `version`,
  ADD COLUMN `changelog` TEXT NULL AFTER `parent_id`,
  ADD INDEX `idx_test_suites_parent_id` (`parent_id`);
