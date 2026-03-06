"""LLM 智能生成测试用例"""
import json
import re
import httpx
from typing import List, Dict, Any

from app.core.database import prisma
from app.core.config import settings
from app.core.logging import get_logger
from app.core.http_client import get_http_client

logger = get_logger("testcase_generator")


GENERATE_SYSTEM_PROMPT = """你是一个专业的 AI Agent 测试用例设计专家。
根据用户提供的 Agent 系统提示词和技能列表，生成高质量的测试用例。

输出要求：
- 严格输出 JSON 数组格式
- 每个测试用例包含 input（用户输入）和 expected_output（期望输出要点）
- 测试用例应覆盖 Agent 的各种能力和边界情况
- 不同难度级别分配合理

重要约束：
- 绝对不要编造虚假的 RequestId、TraceId、实例ID、工单号等标识符
- 不要编造具体的时间戳、日期等看似真实的日志数据
- 如果测试场景需要标识符，使用明显的占位符如 <RequestId>、<实例ID>、<时间> 等
- input 中应描述测试意图和场景，而非模拟真实的用户请求数据
- expected_output 描述期望的输出要点和行为，不需要完整答案

输出格式：
[
  {"input": "用户问题", "expected_output": "期望输出要点描述"},
  ...
]
"""


def _build_generate_prompt(system_prompt: str, skills: List[Dict], count: int, difficulty: str) -> str:
    skills_desc = ""
    if skills:
        lines = []
        for s in skills:
            name = s.get('name', '')
            desc = s.get('description', '')
            instructions = s.get('instructions', '')
            line = f"- **{name}**: {desc}"
            if instructions:
                # 截取前 200 字符的指令摘要，帮助 LLM 理解技能的具体行为
                summary = instructions[:200].replace('\n', ' ')
                if len(instructions) > 200:
                    summary += '...'
                line += f"\n  详细指令: {summary}"
            lines.append(line)
            # 递归处理子技能
            for child in (s.get('children') or []):
                child_name = child.get('name', '')
                child_desc = child.get('description', '')
                lines.append(f"  - {child_name}: {child_desc}")
        skills_desc = "\n".join(lines)

    difficulty_guide = {
        "easy": "简单：基础功能验证，常见用法",
        "medium": "中等：复杂场景，需要组合能力",
        "hard": "困难：边界情况、异常输入、多步推理",
        "mixed": "混合难度：简单30% + 中等50% + 困难20%",
    }

    return f"""请为以下 Agent 生成 {count} 个测试用例。

## Agent 系统提示词
{system_prompt}

## Agent 技能列表
{skills_desc or '未提供具体技能信息'}

## 难度要求
{difficulty_guide.get(difficulty, difficulty_guide['mixed'])}

## 生成要求
1. 测试用例应覆盖 Agent 声明的主要技能
2. 包含正常用例和边界情况
3. expected_output 描述期望的输出要点（不需要完整答案）
4. 生成恰好 {count} 个测试用例
5. 不要编造看似真实的 ID、时间戳、实例名等数据，使用 <占位符> 格式代替
6. input 应聚焦于测试 Agent 的能力和逻辑，而非模拟特定数据

请输出 JSON 数组。"""


async def _get_llm_config(model_config_id: str = None) -> Dict[str, str]:
    """从 DB 获取指定/激活的 ModelConfig，fallback 到 .env"""
    if model_config_id:
        cfg = await prisma.modelconfig.find_unique(where={"id": model_config_id})
        if cfg:
            return {"base_url": cfg.baseUrl, "api_key": cfg.apiKey, "model": cfg.modelName}
    active = await prisma.modelconfig.find_first(where={"isActive": True}, order={"updatedAt": "desc"})
    if active:
        return {
            "base_url": active.baseUrl,
            "api_key": active.apiKey,
            "model": active.modelName,
        }
    return {
        "base_url": settings.JUDGE_LLM_BASE_URL,
        "api_key": settings.JUDGE_LLM_API_KEY,
        "model": settings.JUDGE_LLM_MODEL,
    }


async def generate_test_cases(
    system_prompt: str,
    skills: List[Dict[str, Any]],
    count: int = 10,
    difficulty: str = "mixed",
    model_config_id: str = None,
) -> List[Dict[str, Any]]:
    """调用 LLM 生成测试用例"""
    llm_config = await _get_llm_config(model_config_id)

    if not llm_config["base_url"] or not llm_config["api_key"]:
        return _fallback_cases(count)

    prompt = _build_generate_prompt(system_prompt, skills, count, difficulty)
    url = f"{llm_config['base_url'].rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {llm_config['api_key']}",
        "Content-Type": "application/json",
    }
    body = {
        "model": llm_config["model"],
        "messages": [
            {"role": "system", "content": GENERATE_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.7,
        "max_tokens": 4096,
    }

    try:
        client = get_http_client()
        resp = await client.post(url, json=body, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        return _parse_cases(content)
    except Exception as e:
        logger.error("testcase_generation_failed", error=str(e))
        return _fallback_cases(count)


def _parse_cases(text: str) -> List[Dict[str, Any]]:
    json_match = re.search(r'\[[\s\S]*\]', text)
    if json_match:
        try:
            cases = json.loads(json_match.group())
            if isinstance(cases, list):
                return [{"input": c.get("input", ""), "expected_output": c.get("expected_output", "")} for c in cases if c.get("input")]
        except json.JSONDecodeError:
            pass
    return [{"input": text[:200], "expected_output": "解析失败，请手动编辑"}]


def _fallback_cases(count: int) -> List[Dict[str, Any]]:
    return [
        {"input": f"测试用例 {i+1}（请编辑）", "expected_output": "请填写期望输出"}
        for i in range(min(count, 5))
    ]
