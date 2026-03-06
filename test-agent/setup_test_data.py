"""
快速注册脚本
============
自动向评测平台注册测试 Agent、创建测试套件，方便快速开始测试。

用法:
  python setup_test_data.py [--platform-url http://localhost:8000]
"""
import argparse
import json
import sys

import requests

DEFAULT_PLATFORM_URL = "http://localhost:8000"
DEFAULT_AGENT_URL = "http://localhost:8900"

# 运行时会被 main() 更新
_agent_url = DEFAULT_AGENT_URL


def create_agents(base_url: str) -> dict:
    """注册多个不同类型的测试 Agent"""
    agents = {}

    # 1. HTTP Agent（高质量）
    resp = requests.post(f"{base_url}/api/agents", json={
        "name": "测试Agent-HTTP-高质量",
        "description": "本地 HTTP 测试 Agent，回答质量高，适合作为基线",
        "agent_type": "http",
        "agent_config": {
            "url": f"{_agent_url}/api/chat",
            "method": "POST",
            "request_template": {"message": "{{input}}", "quality": "high"},
            "response_path": "content",
            "timeout": 30,
        },
        "tags": ["test", "http", "high-quality"],
    })
    if resp.ok:
        agents["http_high"] = resp.json()
        print(f"  [OK] HTTP Agent (高质量): {agents['http_high']['id']}")
    else:
        print(f"  [FAIL] HTTP Agent (高质量): {resp.text}")

    # 2. HTTP Agent（低质量，用于对比）
    resp = requests.post(f"{base_url}/api/agents", json={
        "name": "测试Agent-HTTP-低质量",
        "description": "本地 HTTP 测试 Agent，回答质量低，用于和高质量对比",
        "agent_type": "http",
        "agent_config": {
            "url": f"{_agent_url}/api/chat",
            "method": "POST",
            "request_template": {"message": "{{input}}", "quality": "low"},
            "response_path": "content",
            "timeout": 30,
        },
        "tags": ["test", "http", "low-quality"],
    })
    if resp.ok:
        agents["http_low"] = resp.json()
        print(f"  [OK] HTTP Agent (低质量): {agents['http_low']['id']}")
    else:
        print(f"  [FAIL] HTTP Agent (低质量): {resp.text}")

    # 3. OpenAI 兼容 Agent
    resp = requests.post(f"{base_url}/api/agents", json={
        "name": "测试Agent-OpenAI兼容",
        "description": "本地 OpenAI 兼容接口测试 Agent，支持工具调用",
        "agent_type": "openai",
        "agent_config": {
            "base_url": f"{_agent_url}/v1",
            "api_key": "test-key",
            "model": "test-agent-v1",
            "system_prompt": "你是一个有用的助手，请准确回答用户的问题。",
            "temperature": 0.7,
            "timeout": 30,
        },
        "tags": ["test", "openai"],
    })
    if resp.ok:
        agents["openai"] = resp.json()
        print(f"  [OK] OpenAI Agent: {agents['openai']['id']}")
    else:
        print(f"  [FAIL] OpenAI Agent: {resp.text}")

    # 4. OpenAI 兼容 Agent（错误回答，用于 bad case 测试）
    resp = requests.post(f"{base_url}/api/agents", json={
        "name": "测试Agent-OpenAI-错误回答",
        "description": "故意给出错误回答的 Agent，用于测试 bad case 检测",
        "agent_type": "openai",
        "agent_config": {
            "base_url": f"{_agent_url}/v1",
            "api_key": "test-key",
            "model": "test-agent-wrong",
            "system_prompt": "你是一个助手。",
            "temperature": 0.7,
            "timeout": 30,
        },
        "tags": ["test", "openai", "bad-case"],
    })
    if resp.ok:
        agents["openai_wrong"] = resp.json()
        print(f"  [OK] OpenAI Agent (错误回答): {agents['openai_wrong']['id']}")
    else:
        print(f"  [FAIL] OpenAI Agent (错误回答): {resp.text}")

    return agents


def create_test_suites(base_url: str) -> dict:
    """创建多个测试套件"""
    suites = {}

    # 1. 知识问答测试套件
    resp = requests.post(f"{base_url}/api/test-suites", json={
        "name": "知识问答测试集",
        "description": "测试 Agent 对各类知识问题的回答质量",
        "tags": ["knowledge", "qa"],
        "test_cases": [
            {
                "id": "qa-001",
                "input": "介绍一下 Python 编程语言",
                "expected_output": "Python 是一种高级编程语言，由 Guido van Rossum 于 1991 年创建",
                "assertions": [
                    {"type": "contains", "value": "Python", "critical": True},
                    {"type": "contains", "value": "编程语言"},
                    {"type": "not_contains", "value": "Java"},
                    {"type": "min_length", "value": 20},
                ],
            },
            {
                "id": "qa-002",
                "input": "什么是机器学习？",
                "expected_output": "机器学习是人工智能的一个分支，通过从数据中学习模式来做出预测或决策",
                "assertions": [
                    {"type": "contains", "value": "机器学习", "critical": True},
                    {"type": "contains", "value": "人工智能"},
                    {"type": "min_length", "value": 30},
                ],
            },
            {
                "id": "qa-003",
                "input": "请介绍一下 Docker",
                "expected_output": "Docker 是一个开源容器化平台",
                "assertions": [
                    {"type": "contains", "value": "Docker", "critical": True},
                    {"type": "contains", "value": "容器"},
                ],
            },
            {
                "id": "qa-004",
                "input": "FastAPI 框架有什么特点？",
                "expected_output": "FastAPI 是一个现代的 Python Web 框架",
                "assertions": [
                    {"type": "contains", "value": "FastAPI", "critical": True},
                    {"type": "contains", "value": "Python"},
                ],
            },
            {
                "id": "qa-005",
                "input": "什么是 Kubernetes？",
                "expected_output": "Kubernetes 是一个开源的容器编排平台",
                "assertions": [
                    {"type": "contains", "value": "Kubernetes", "critical": True},
                    {"type": "contains", "value": "容器"},
                ],
            },
        ],
    })
    if resp.ok:
        suites["knowledge"] = resp.json()
        print(f"  [OK] 知识问答测试集: {suites['knowledge']['id']} ({len(resp.json().get('test_cases', []))} 条用例)")
    else:
        print(f"  [FAIL] 知识问答测试集: {resp.text}")

    # 2. 工具调用测试套件
    resp = requests.post(f"{base_url}/api/test-suites", json={
        "name": "工具调用测试集",
        "description": "测试 Agent 正确使用工具的能力",
        "tags": ["tool-calling", "function"],
        "test_cases": [
            {
                "id": "tool-001",
                "input": "计算 123 + 456",
                "expected_output": "579",
                "assertions": [
                    {"type": "contains", "value": "579", "critical": True},
                    {"type": "tool_called", "value": "calculate"},
                ],
            },
            {
                "id": "tool-002",
                "input": "计算 99 * 88",
                "expected_output": "8712",
                "assertions": [
                    {"type": "contains", "value": "8712", "critical": True},
                    {"type": "tool_called", "value": "calculate"},
                ],
            },
            {
                "id": "tool-003",
                "input": "现在几点了？",
                "expected_output": "当前时间",
                "assertions": [
                    {"type": "regex_match", "value": "\\d{4}-\\d{2}-\\d{2}"},
                    {"type": "tool_called", "value": "get_current_time"},
                ],
            },
            {
                "id": "tool-004",
                "input": "翻译 你好",
                "expected_output": "Hello",
                "assertions": [
                    {"type": "contains", "value": "Hello", "critical": True},
                    {"type": "tool_called", "value": "translate"},
                ],
            },
            {
                "id": "tool-005",
                "input": "计算 (100 + 200) * 3",
                "expected_output": "900",
                "assertions": [
                    {"type": "contains", "value": "900", "critical": True},
                ],
            },
        ],
    })
    if resp.ok:
        suites["tools"] = resp.json()
        print(f"  [OK] 工具调用测试集: {suites['tools']['id']} ({len(resp.json().get('test_cases', []))} 条用例)")
    else:
        print(f"  [FAIL] 工具调用测试集: {resp.text}")

    # 3. 综合场景测试套件
    resp = requests.post(f"{base_url}/api/test-suites", json={
        "name": "综合场景测试集",
        "description": "混合不同类型的测试用例，模拟真实使用场景",
        "tags": ["comprehensive", "mixed"],
        "test_cases": [
            {
                "id": "mix-001",
                "input": "介绍一下 AI Agent 的核心能力",
                "expected_output": "AI Agent 是能够自主感知环境、做出决策并执行行动的智能体",
                "assertions": [
                    {"type": "contains", "value": "Agent", "critical": True},
                    {"type": "min_length", "value": 20},
                ],
            },
            {
                "id": "mix-002",
                "input": "帮我算一下 256 / 8",
                "expected_output": "32",
                "assertions": [
                    {"type": "contains", "value": "32", "critical": True},
                ],
            },
            {
                "id": "mix-003",
                "input": "介绍一下腾讯公司",
                "expected_output": "腾讯是中国领先的互联网科技公司",
                "assertions": [
                    {"type": "contains", "value": "腾讯", "critical": True},
                    {"type": "contains", "value": "互联网"},
                ],
            },
            {
                "id": "mix-004",
                "input": "关于数据库选型有什么建议？",
                "expected_output": "常见数据库类型",
                "assertions": [
                    {"type": "contains", "value": "数据库", "critical": True},
                ],
            },
            {
                "id": "mix-005",
                "input": "北京今天天气怎么样？",
                "expected_output": "北京天气晴朗",
                "assertions": [
                    {"type": "contains", "value": "北京"},
                    {"type": "contains", "value": "天气"},
                ],
            },
        ],
    })
    if resp.ok:
        suites["comprehensive"] = resp.json()
        print(f"  [OK] 综合场景测试集: {suites['comprehensive']['id']} ({len(resp.json().get('test_cases', []))} 条用例)")
    else:
        print(f"  [FAIL] 综合场景测试集: {resp.text}")

    return suites


def test_connectivity(base_url: str, agents: dict):
    """测试 Agent 连通性"""
    for name, agent in agents.items():
        agent_id = agent.get("id")
        if agent_id:
            resp = requests.post(f"{base_url}/api/agents/{agent_id}/test")
            status = "OK" if resp.ok else "FAIL"
            print(f"  [{status}] 连通性测试 - {agent.get('name', name)}")


def main():
    parser = argparse.ArgumentParser(description="注册测试数据到评测平台")
    parser.add_argument("--platform-url", default=DEFAULT_PLATFORM_URL, help="评测平台 URL")
    parser.add_argument("--agent-url", default=DEFAULT_AGENT_URL, help="测试 Agent URL")
    parser.add_argument("--skip-agents", action="store_true", help="跳过 Agent 注册")
    parser.add_argument("--skip-suites", action="store_true", help="跳过测试套件创建")
    args = parser.parse_args()

    global _agent_url
    _agent_url = args.agent_url
    base_url = args.platform_url.rstrip("/")

    print(f"\n{'='*60}")
    print(f"  评测平台测试数据注册工具")
    print(f"  平台地址: {base_url}")
    print(f"  Agent地址: {_agent_url}")
    print(f"{'='*60}\n")

    # 检查平台连通性
    try:
        resp = requests.get(f"{base_url}/api/dashboard/stats", timeout=5)
        if resp.ok:
            print("[OK] 评测平台连接正常\n")
        else:
            print(f"[WARN] 评测平台响应异常: {resp.status_code}\n")
    except Exception as e:
        print(f"[FAIL] 无法连接评测平台: {e}")
        print("请确保评测平台已启动。\n")
        sys.exit(1)

    # 检查 Agent 连通性
    try:
        resp = requests.get(f"{_agent_url}/health", timeout=5)
        if resp.ok:
            print("[OK] 测试 Agent 连接正常\n")
        else:
            print(f"[WARN] 测试 Agent 响应异常: {resp.status_code}\n")
    except Exception as e:
        print(f"[FAIL] 无法连接测试 Agent: {e}")
        print("请先启动测试 Agent: cd test-agent && uvicorn agent_server:app --port 8900\n")
        sys.exit(1)

    # 注册 Agent
    agents = {}
    if not args.skip_agents:
        print("--- 注册测试 Agent ---")
        agents = create_agents(base_url)
        print()

    # 创建测试套件
    suites = {}
    if not args.skip_suites:
        print("--- 创建测试套件 ---")
        suites = create_test_suites(base_url)
        print()

    # 测试连通性
    if agents:
        print("--- 测试 Agent 连通性 ---")
        test_connectivity(base_url, agents)
        print()

    # 输出汇总
    print(f"{'='*60}")
    print("  注册完成！")
    print(f"{'='*60}")
    print(f"\n已注册 {len(agents)} 个 Agent，{len(suites)} 个测试套件。")
    print(f"\n下一步:")
    print(f"  1. 打开评测平台前端: http://localhost:5173")
    print(f"  2. 在「Agent 管理」页面查看已注册的 Agent")
    print(f"  3. 在「测试套件」页面查看测试用例")
    print(f"  4. 创建评测运行，开始测试！")

    if agents and suites:
        print(f"\n推荐的评测运行组合:")
        if "http_high" in agents and "knowledge" in suites:
            print(f"  - Agent: {agents['http_high']['name']}  +  测试集: {suites['knowledge']['name']}")
        if "openai" in agents and "tools" in suites:
            print(f"  - Agent: {agents['openai']['name']}  +  测试集: {suites['tools']['name']}")
        if "http_high" in agents and "http_low" in agents and "comprehensive" in suites:
            print(f"  - 对比测试: 高质量 vs 低质量 Agent  +  测试集: {suites['comprehensive']['name']}")


if __name__ == "__main__":
    main()
