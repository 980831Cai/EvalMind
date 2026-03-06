-- ============================================================
-- EvalMind - Seed Data
-- ============================================================
-- Version: 1.0.0
-- Date: 2026-02-24
-- Description: Initial data for development and testing
-- ============================================================

USE agent_eval_platform;

-- Clear existing data (for development only)
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE eval_results;
TRUNCATE TABLE eval_runs;
TRUNCATE TABLE agents;
TRUNCATE TABLE test_suites;
TRUNCATE TABLE judge_config;
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- 1. Model Config Templates (API keys must be provided by user)
-- ============================================================

INSERT INTO judge_config (
    id, provider, model_name, base_url, api_key,
    temperature, max_tokens, top_p,
    is_active, test_status,
    created_at, updated_at
) VALUES
-- OpenAI GPT-4o
(
    'judge-001',
    'openai',
    'gpt-4o',
    'https://api.openai.com/v1',
    '',
    0.30, 2048, 1.00,
    FALSE, NULL,
    NOW(), NOW()
),
-- DeepSeek
(
    'judge-002',
    'deepseek',
    'deepseek-chat',
    'https://api.deepseek.com/v1',
    '',
    0.30, 2048, 1.00,
    FALSE, NULL,
    NOW(), NOW()
),
-- Anthropic Claude
(
    'judge-003',
    'anthropic',
    'claude-sonnet-4-20250514',
    'https://api.anthropic.com/v1',
    '',
    0.30, 2048, 1.00,
    FALSE, NULL,
    NOW(), NOW()
),
-- Google Gemini
(
    'judge-004',
    'google',
    'gemini-2.0-flash',
    'https://generativelanguage.googleapis.com/v1beta/openai',
    '',
    0.30, 2048, 1.00,
    FALSE, NULL,
    NOW(), NOW()
),
-- Local Ollama (no API key needed)
(
    'judge-005',
    'ollama',
    'qwen2.5:14b',
    'http://localhost:11434/v1',
    'ollama',
    0.30, 2048, 1.00,
    FALSE, NULL,
    NOW(), NOW()
);

-- ============================================================
-- 2. Agent Data
-- ============================================================

INSERT INTO agents (
    id, name, description, system_prompt, skills, tags, metadata,
    created_at, updated_at
) VALUES
-- General Assistant Agent
(
    'agent-001',
    'General Assistant',
    'A general-purpose conversational assistant',
    'You are a helpful assistant. Answer user questions clearly and concisely.',
    JSON_ARRAY(
        JSON_OBJECT('name', 'web_search', 'description', 'Search the web for information'),
        JSON_OBJECT('name', 'calculator', 'description', 'Perform mathematical calculations')
    ),
    JSON_ARRAY('general', 'qa'),
    JSON_OBJECT('version', '1.0', 'author', 'system'),
    NOW(), NOW()
),
-- Code Assistant Agent
(
    'agent-002',
    'Code Assistant',
    'A programming and code assistant',
    'You are an expert programming assistant. Help users with code, debugging, and technical questions. Provide clear explanations and working code examples.',
    JSON_ARRAY(
        JSON_OBJECT('name', 'code_search', 'description', 'Search code repositories'),
        JSON_OBJECT('name', 'code_execution', 'description', 'Execute code snippets'),
        JSON_OBJECT('name', 'documentation', 'description', 'Search technical documentation')
    ),
    JSON_ARRAY('coding', 'technical'),
    JSON_OBJECT('version', '1.0', 'author', 'system', 'languages', JSON_ARRAY('python', 'javascript', 'typescript')),
    NOW(), NOW()
),
-- Math Tutor Agent
(
    'agent-003',
    'Math Tutor',
    'A math teaching assistant for explaining concepts',
    'You are a patient math tutor. Explain mathematical concepts step-by-step and help students understand the reasoning behind solutions.',
    JSON_ARRAY(
        JSON_OBJECT('name', 'calculator', 'description', 'Perform calculations'),
        JSON_OBJECT('name', 'plot_graph', 'description', 'Generate mathematical graphs'),
        JSON_OBJECT('name', 'solve_equation', 'description', 'Solve mathematical equations')
    ),
    JSON_ARRAY('education', 'math'),
    JSON_OBJECT('version', '1.0', 'author', 'system', 'subjects', JSON_ARRAY('algebra', 'calculus', 'geometry')),
    NOW(), NOW()
);

-- ============================================================
-- 3. Test Suite Data
-- ============================================================

INSERT INTO test_suites (
    id, name, description, test_cases, tags, source,
    created_at, updated_at
) VALUES
-- Basic Conversation Tests
(
    'suite-001',
    'Basic Conversation Tests',
    'Test basic conversational abilities of an Agent',
    JSON_ARRAY(
        JSON_OBJECT(
            'id', 'tc-001',
            'input', 'Hello, how are you?',
            'expected_output', 'A friendly greeting response',
            'metadata', JSON_OBJECT('difficulty', 'easy', 'category', 'greeting')
        ),
        JSON_OBJECT(
            'id', 'tc-002',
            'input', 'What is the capital of France?',
            'expected_output', 'Paris',
            'metadata', JSON_OBJECT('difficulty', 'easy', 'category', 'factual')
        ),
        JSON_OBJECT(
            'id', 'tc-003',
            'input', 'Can you explain what artificial intelligence is?',
            'expected_output', 'A clear explanation of AI',
            'metadata', JSON_OBJECT('difficulty', 'medium', 'category', 'explanation')
        ),
        JSON_OBJECT(
            'id', 'tc-004',
            'input', 'Tell me a joke',
            'expected_output', 'A joke or humorous response',
            'metadata', JSON_OBJECT('difficulty', 'easy', 'category', 'creative')
        ),
        JSON_OBJECT(
            'id', 'tc-005',
            'input', 'What are the benefits of exercise?',
            'expected_output', 'Health benefits of physical activity',
            'metadata', JSON_OBJECT('difficulty', 'medium', 'category', 'informational')
        )
    ),
    JSON_ARRAY('qa', 'general', 'basic'),
    'manual',
    NOW(), NOW()
),
-- Programming Questions
(
    'suite-002',
    'Programming Questions',
    'Test programming and code-related Q&A abilities',
    JSON_ARRAY(
        JSON_OBJECT(
            'id', 'tc-101',
            'input', 'How do I reverse a string in Python?',
            'expected_output', 'Code example using [::-1] or reversed()',
            'metadata', JSON_OBJECT('difficulty', 'easy', 'language', 'python')
        ),
        JSON_OBJECT(
            'id', 'tc-102',
            'input', 'Explain the difference between == and === in JavaScript',
            'expected_output', 'Explanation of loose vs strict equality',
            'metadata', JSON_OBJECT('difficulty', 'medium', 'language', 'javascript')
        ),
        JSON_OBJECT(
            'id', 'tc-103',
            'input', 'Write a function to check if a number is prime',
            'expected_output', 'Working prime check function',
            'metadata', JSON_OBJECT('difficulty', 'medium', 'type', 'algorithm')
        ),
        JSON_OBJECT(
            'id', 'tc-104',
            'input', 'What is a closure in JavaScript?',
            'expected_output', 'Explanation with example',
            'metadata', JSON_OBJECT('difficulty', 'hard', 'language', 'javascript')
        )
    ),
    JSON_ARRAY('coding', 'technical'),
    'manual',
    NOW(), NOW()
),
-- Math Problems
(
    'suite-003',
    'Math Problems',
    'Test mathematical problem-solving abilities',
    JSON_ARRAY(
        JSON_OBJECT(
            'id', 'tc-201',
            'input', 'What is 15 * 23?',
            'expected_output', '345',
            'metadata', JSON_OBJECT('difficulty', 'easy', 'type', 'arithmetic')
        ),
        JSON_OBJECT(
            'id', 'tc-202',
            'input', 'Solve for x: 2x + 5 = 13',
            'expected_output', 'x = 4',
            'metadata', JSON_OBJECT('difficulty', 'medium', 'type', 'algebra')
        ),
        JSON_OBJECT(
            'id', 'tc-203',
            'input', 'What is the derivative of x^2 + 3x + 1?',
            'expected_output', '2x + 3',
            'metadata', JSON_OBJECT('difficulty', 'medium', 'type', 'calculus')
        ),
        JSON_OBJECT(
            'id', 'tc-204',
            'input', 'Explain the Pythagorean theorem',
            'expected_output', 'a^2 + b^2 = c^2 explanation',
            'metadata', JSON_OBJECT('difficulty', 'easy', 'type', 'geometry')
        )
    ),
    JSON_ARRAY('math', 'education'),
    'manual',
    NOW(), NOW()
);

-- ============================================================
-- 4. Sample Eval Run (optional)
-- ============================================================

INSERT INTO eval_runs (
    id, agent_id, test_suite_id,
    agent_snapshot, test_suite_snapshot,
    dimensions, concurrency, timeout,
    status, progress, current_item, total_items,
    passed_count, failed_count, average_score,
    created_at, started_at, completed_at
) VALUES (
    'run-001',
    'agent-001',
    'suite-001',
    JSON_OBJECT(
        'id', 'agent-001',
        'name', 'General Assistant',
        'system_prompt', 'You are a helpful assistant.'
    ),
    JSON_OBJECT(
        'id', 'suite-001',
        'name', 'Basic Conversation Tests',
        'totalCases', 5
    ),
    JSON_ARRAY('accuracy', 'helpfulness', 'clarity'),
    5, 60,
    'completed', 100, 5, 5,
    4, 1, 0.82,
    NOW() - INTERVAL 1 HOUR,
    NOW() - INTERVAL 1 HOUR + INTERVAL 5 MINUTE,
    NOW() - INTERVAL 50 MINUTE
);

-- Sample eval results
INSERT INTO eval_results (
    id, eval_run_id, test_case_id,
    input, expected_output,
    agent_output, agent_thinking,
    skills_called,
    scores, overall_score, passed,
    reasoning, latency_ms, token_usage,
    created_at
) VALUES
-- Test case 1: Pass
(
    'result-001', 'run-001', 'tc-001',
    'Hello, how are you?',
    'A friendly greeting response',
    'Hello! I''m doing well, thank you for asking. How can I help you today?',
    'The user is greeting me. I should respond warmly and offer assistance.',
    JSON_ARRAY(
        JSON_OBJECT('skill', 'none', 'params', JSON_OBJECT(), 'result', NULL, 'timestamp', NOW(), 'success', TRUE)
    ),
    JSON_OBJECT('accuracy', 0.95, 'helpfulness', 0.90, 'clarity', 0.95),
    0.93, TRUE,
    'Response is friendly, appropriate, and offers help. Excellent greeting.',
    234, JSON_OBJECT('prompt', 45, 'completion', 28),
    NOW() - INTERVAL 55 MINUTE
),
-- Test case 2: Pass
(
    'result-002', 'run-001', 'tc-002',
    'What is the capital of France?',
    'Paris',
    'The capital of France is Paris.',
    'This is a straightforward factual question.',
    NULL,
    JSON_OBJECT('accuracy', 1.00, 'helpfulness', 0.85, 'clarity', 0.95),
    0.93, TRUE,
    'Correct answer provided clearly and concisely.',
    187, JSON_OBJECT('prompt', 38, 'completion', 15),
    NOW() - INTERVAL 54 MINUTE
),
-- Test case 3: Pass
(
    'result-003', 'run-001', 'tc-003',
    'Can you explain what artificial intelligence is?',
    'A clear explanation of AI',
    'Artificial Intelligence (AI) refers to computer systems that can perform tasks that typically require human intelligence, such as learning, reasoning, and problem-solving.',
    'Need to provide a clear, accessible explanation.',
    NULL,
    JSON_OBJECT('accuracy', 0.90, 'helpfulness', 0.95, 'clarity', 0.90),
    0.92, TRUE,
    'Good explanation that is clear and informative.',
    312, JSON_OBJECT('prompt', 42, 'completion', 56),
    NOW() - INTERVAL 53 MINUTE
),
-- Test case 4: Pass
(
    'result-004', 'run-001', 'tc-004',
    'Tell me a joke',
    'A joke or humorous response',
    'Why don''t scientists trust atoms? Because they make up everything!',
    'User wants humor. I''ll share a science joke.',
    NULL,
    JSON_OBJECT('accuracy', 0.85, 'helpfulness', 0.80, 'clarity', 0.95),
    0.87, TRUE,
    'Appropriate joke response. Could be funnier but meets requirements.',
    156, JSON_OBJECT('prompt', 35, 'completion', 22),
    NOW() - INTERVAL 52 MINUTE
),
-- Test case 5: Fail (example)
(
    'result-005', 'run-001', 'tc-005',
    'What are the benefits of exercise?',
    'Health benefits of physical activity',
    'Exercise is good.',
    'User asking about exercise benefits.',
    NULL,
    JSON_OBJECT('accuracy', 0.40, 'helpfulness', 0.30, 'clarity', 0.60),
    0.43, FALSE,
    'Response is too brief and lacks detail. Does not adequately explain benefits.',
    143, JSON_OBJECT('prompt', 37, 'completion', 8),
    NOW() - INTERVAL 51 MINUTE
);

-- ============================================================
-- Verify Data
-- ============================================================

SELECT 'Model Configs' AS table_name, COUNT(*) AS count FROM judge_config
UNION ALL
SELECT 'Agents', COUNT(*) FROM agents
UNION ALL
SELECT 'Test Suites', COUNT(*) FROM test_suites
UNION ALL
SELECT 'Eval Runs', COUNT(*) FROM eval_runs
UNION ALL
SELECT 'Eval Results', COUNT(*) FROM eval_results;
