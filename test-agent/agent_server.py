"""
本地测试 Agent 服务器
=====================
同时提供两种接入方式，用于全面测试评测平台：
1. HTTP 通用接口 (POST /api/chat)
2. OpenAI 兼容接口 (POST /v1/chat/completions)

支持的测试场景:
- 正常问答（含工具调用、思考过程模拟）
- 可控质量（通过 quality 参数控制回答质量）
- 模拟延迟（通过 delay 参数模拟慢响应）
- 模拟错误（通过特定输入触发错误）
- 多轮对话

启动方式:
  uvicorn agent_server:app --host 0.0.0.0 --port 8900 --reload
"""
import asyncio
import json
import random
import time
import uuid
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Test Agent for Eval Platform", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# =============================================================================
# 知识库 & 工具模拟
# =============================================================================

KNOWLEDGE_BASE: Dict[str, str] = {
    "天气": "今天北京天气晴朗，气温22°C，适合户外活动。上海多云转阴，气温18°C。",
    "weather": "Today in Beijing: sunny, 22°C. Shanghai: cloudy, 18°C.",
    "python": "Python 是一种高级编程语言，由 Guido van Rossum 于 1991 年创建。它以简洁清晰的语法著称，广泛用于 Web 开发、数据科学、人工智能等领域。",
    "机器学习": "机器学习是人工智能的一个分支，通过从数据中学习模式来做出预测或决策。主要方法包括监督学习、无监督学习和强化学习。常用框架有 TensorFlow、PyTorch 等。",
    "腾讯": "腾讯是中国领先的互联网科技公司，成立于1998年，总部位于深圳。核心产品包括微信、QQ、腾讯云等。",
    "docker": "Docker 是一个开源容器化平台，允许开发者将应用及其依赖打包到容器中。核心概念包括镜像(Image)、容器(Container)、仓库(Registry)。",
    "fastapi": "FastAPI 是一个现代的 Python Web 框架，基于 Starlette 和 Pydantic 构建。支持异步处理、自动生成 OpenAPI 文档，性能接近 Node.js 和 Go。",
    "数据库": "常见数据库类型：关系型(MySQL, PostgreSQL)、文档型(MongoDB)、键值型(Redis)、图数据库(Neo4j)。选择数据库应考虑数据结构、查询模式、扩展性需求。",
    "kubernetes": "Kubernetes (K8s) 是一个开源的容器编排平台，用于自动化部署、扩展和管理容器化应用。核心概念包括 Pod、Service、Deployment、Namespace。",
    "agent": "AI Agent 是能够自主感知环境、做出决策并执行行动的智能体。核心能力包括：规划(Planning)、记忆(Memory)、工具使用(Tool Use)、反思(Reflection)。",
}

TOOLS_REGISTRY = {
    "search_knowledge": {
        "description": "搜索知识库获取相关信息",
        "parameters": {"query": "搜索关键词"},
    },
    "calculate": {
        "description": "执行数学计算",
        "parameters": {"expression": "数学表达式"},
    },
    "get_current_time": {
        "description": "获取当前时间",
        "parameters": {},
    },
    "translate": {
        "description": "文本翻译",
        "parameters": {"text": "待翻译文本", "target_lang": "目标语言"},
    },
}


def search_knowledge(query: str) -> str:
    """模拟知识库搜索"""
    results = []
    query_lower = query.lower()
    for key, value in KNOWLEDGE_BASE.items():
        if key.lower() in query_lower or query_lower in key.lower():
            results.append(value)
    if not results:
        # 模糊匹配
        for key, value in KNOWLEDGE_BASE.items():
            if any(c in query_lower for c in key.lower() if len(c) > 1):
                results.append(value)
                break
    return results[0] if results else f"未找到与「{query}」相关的信息。"


def calculate(expression: str) -> str:
    """安全的数学计算"""
    allowed = set("0123456789+-*/.() ")
    if not all(c in allowed for c in expression):
        return "不支持的表达式"
    try:
        result = eval(expression)  # noqa: S307 - 仅用于测试，已做字符白名单校验
        return str(result)
    except Exception:
        return "计算错误"


def get_current_time() -> str:
    from datetime import datetime
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def translate(text: str, target_lang: str = "en") -> str:
    """极简翻译模拟"""
    translations = {
        "你好": "Hello",
        "谢谢": "Thank you",
        "再见": "Goodbye",
        "hello": "你好",
        "thank you": "谢谢",
        "goodbye": "再见",
    }
    return translations.get(text.lower(), f"[翻译] {text} -> ({target_lang})")


TOOL_EXECUTORS = {
    "search_knowledge": lambda args: search_knowledge(args.get("query", "")),
    "calculate": lambda args: calculate(args.get("expression", "")),
    "get_current_time": lambda _: get_current_time(),
    "translate": lambda args: translate(args.get("text", ""), args.get("target_lang", "en")),
}

# =============================================================================
# 模型名 → 回答质量映射（支持实验系统的模型变量对比）
# =============================================================================

# 直接映射的测试模型名
_DIRECT_QUALITY_MAP = {
    "test-agent-v1": "high",
    "test-agent-high": "high",
    "test-agent-medium": "medium",
    "test-agent-low": "low",
    "test-agent-wrong": "wrong",
}

# 真实模型名 → 模拟的质量等级（用于实验对比）
_MODEL_QUALITY_MAP = {
    # OpenAI 系列
    "gpt-4o": "high",
    "gpt-4o-mini": "medium",
    "gpt-4-turbo": "high",
    "gpt-4": "high",
    "gpt-3.5-turbo": "medium",
    "gpt-3.5": "low",
    # DeepSeek 系列
    "deepseek-v3": "high",
    "deepseek-v3.1": "high",
    "deepseek-v2.5": "medium",
    "deepseek-chat": "medium",
    "deepseek-r1": "high",
    # Claude 系列
    "claude-3.5-sonnet": "high",
    "claude-3-opus": "high",
    "claude-3-sonnet": "high",
    "claude-3-haiku": "medium",
    "claude-3.5-haiku": "medium",
    # Kimi / Moonshot
    "kimi-k2.5": "high",
    "kimi-k2": "medium",
    "moonshot-v1-8k": "medium",
    "moonshot-v1-32k": "high",
    # Qwen
    "qwen-turbo": "medium",
    "qwen-plus": "high",
    "qwen-max": "high",
    # Llama
    "llama-3.1-70b": "high",
    "llama-3.1-8b": "medium",
    "llama-3-8b": "low",
}


def model_to_quality(model_name: str) -> str:
    """将模型名映射为回答质量等级，支持任意模型名"""
    # 1. 精确匹配
    if model_name in _DIRECT_QUALITY_MAP:
        return _DIRECT_QUALITY_MAP[model_name]
    if model_name in _MODEL_QUALITY_MAP:
        return _MODEL_QUALITY_MAP[model_name]

    # 2. 模糊匹配：在已知模型名中找包含关系
    model_lower = model_name.lower()
    for known, quality in _MODEL_QUALITY_MAP.items():
        if known in model_lower or model_lower in known:
            return quality

    # 3. 基于模型名中的关键词推断
    if any(kw in model_lower for kw in ["large", "max", "opus", "pro", "70b", "72b"]):
        return "high"
    if any(kw in model_lower for kw in ["mini", "small", "lite", "haiku", "7b", "8b"]):
        return "medium"
    if any(kw in model_lower for kw in ["tiny", "nano", "1b", "3b"]):
        return "low"

    # 4. 默认 high
    return "high"


# =============================================================================
# 智能回答生成（模拟不同质量等级）
# =============================================================================

def generate_answer(message: str, quality: str = "high", system_prompt: str = "") -> Dict[str, Any]:
    """
    根据输入生成回答，返回包含 content, thinking, tool_calls 的字典。
    quality: high / medium / low / wrong
    """
    message_lower = message.lower().strip()
    thinking = ""
    tool_calls = []
    tool_results = []
    content = ""

    # ---- 特殊触发词 ----
    if "error" in message_lower or "错误" in message_lower and "模拟" in message_lower:
        raise ValueError("模拟的 Agent 内部错误")

    if "timeout" in message_lower or "超时" in message_lower and "模拟" in message_lower:
        import time
        time.sleep(120)  # 触发超时

    # ---- 数学计算场景 ----
    if any(op in message for op in ["+", "-", "*", "/", "计算", "算"]):
        thinking = f"用户需要进行数学计算，我应该使用 calculate 工具。分析输入: {message}"
        # 提取数学表达式
        expr = message
        for remove in ["计算", "算", "请", "帮我", "一下", "等于多少", "=?", "？", "?", " "]:
            expr = expr.replace(remove, "")
        expr = expr.strip()
        if expr:
            result = calculate(expr)
            tool_calls.append({"name": "calculate", "arguments": json.dumps({"expression": expr})})
            tool_results.append({"tool": "calculate", "result": result})
            if quality == "high":
                content = f"{expr} = {result}"
            elif quality == "medium":
                content = f"计算结果是 {result}"
            elif quality == "low":
                content = f"大概是 {result} 吧"
            else:  # wrong
                content = f"{expr} = {float(result) + random.randint(1, 100) if result.replace('.','').isdigit() else '未知'}"
        else:
            content = "请提供一个有效的数学表达式。"

    # ---- 知识查询场景 ----
    elif any(kw in message_lower for kw in KNOWLEDGE_BASE.keys()):
        thinking = f"用户在询问特定主题，我需要搜索知识库获取准确信息。关键词分析: {message}"
        kb_result = search_knowledge(message)
        tool_calls.append({"name": "search_knowledge", "arguments": json.dumps({"query": message})})
        tool_results.append({"tool": "search_knowledge", "result": kb_result})

        if quality == "high":
            content = kb_result
        elif quality == "medium":
            content = kb_result[:len(kb_result)//2] + "..."
        elif quality == "low":
            content = "这个问题我了解一些，但不太确定具体细节。"
        else:
            content = "抱歉，我没有找到相关信息。"  # 故意给错

    # ---- 翻译场景 ----
    elif "翻译" in message_lower or "translate" in message_lower:
        thinking = "用户需要翻译服务，使用 translate 工具。"
        text_to_translate = message.replace("翻译", "").replace("translate", "").strip()
        result = translate(text_to_translate)
        tool_calls.append({"name": "translate", "arguments": json.dumps({"text": text_to_translate, "target_lang": "en"})})
        tool_results.append({"tool": "translate", "result": result})
        content = f"翻译结果: {result}"

    # ---- 时间查询 ----
    elif "时间" in message_lower or "几点" in message_lower or "time" in message_lower:
        thinking = "用户询问当前时间，调用 get_current_time 工具。"
        result = get_current_time()
        tool_calls.append({"name": "get_current_time", "arguments": "{}"})
        tool_results.append({"tool": "get_current_time", "result": result})
        content = f"当前时间是: {result}"

    # ---- 通用问答 ----
    else:
        thinking = f"这是一个通用问题，我需要根据自己的知识来回答。问题: {message}"
        if system_prompt:
            thinking += f"\n系统提示词要求: {system_prompt}"

        if quality == "high":
            content = (
                f"关于您的问题「{message}」，以下是我的回答：\n\n"
                f"这是一个很好的问题。基于我的知识，我可以提供以下信息：\n"
                f"1. 首先，我们需要理解问题的核心概念和背景。\n"
                f"2. 其次，从多个角度进行分析可以帮助我们更全面地理解。\n"
                f"3. 最后，结合实际应用场景，可以得出有价值的结论。\n\n"
                f"希望这个回答对您有帮助。如需更详细的信息，请告诉我。"
            )
        elif quality == "medium":
            content = f"关于「{message}」，这个问题涉及多个方面，简单来说就是需要综合考虑各种因素来判断。"
        elif quality == "low":
            content = "嗯...这个问题比较复杂，我不太确定。"
        else:
            content = "42。"  # 故意给一个无关答案

    return {
        "content": content,
        "thinking": thinking,
        "tool_calls": tool_calls,
        "tool_results": tool_results,
    }


# =============================================================================
# HTTP 通用接口 (适配平台的 HTTPAdapter)
# =============================================================================

class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    quality: Optional[str] = "high"  # high / medium / low / wrong
    delay: Optional[float] = 0.0  # 模拟延迟（秒）
    system_prompt: Optional[str] = ""


class ChatResponse(BaseModel):
    content: str
    thinking: str = ""
    tool_calls: List[Dict[str, Any]] = []
    metadata: Dict[str, Any] = {}


@app.post("/api/chat", response_model=ChatResponse)
async def http_chat(req: ChatRequest):
    """HTTP 通用聊天接口 — 对应评测平台的 HTTPAdapter"""
    if req.delay and req.delay > 0:
        await asyncio.sleep(req.delay)

    try:
        result = generate_answer(req.message, req.quality or "high", req.system_prompt or "")
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))

    return ChatResponse(
        content=result["content"],
        thinking=result["thinking"],
        tool_calls=result["tool_calls"],
        metadata={
            "conversation_id": req.conversation_id or str(uuid.uuid4()),
            "quality": req.quality,
            "tool_results": result["tool_results"],
        },
    )


# =============================================================================
# OpenAI 兼容接口 (适配平台的 OpenAIAdapter)
# =============================================================================

class OpenAIMessage(BaseModel):
    role: str
    content: str


class OpenAIChatRequest(BaseModel):
    model: str = "test-agent-v1"
    messages: List[OpenAIMessage]
    temperature: Optional[float] = 0.7
    stream: Optional[bool] = False
    max_tokens: Optional[int] = 2048


class OpenAIChatResponse(BaseModel):
    id: str
    object: str = "chat.completion"
    created: int
    model: str
    choices: List[Dict[str, Any]]
    usage: Dict[str, int]


@app.post("/v1/chat/completions", response_model=OpenAIChatResponse)
async def openai_chat(req: OpenAIChatRequest):
    """OpenAI 兼容的 Chat Completions 接口 — 对应评测平台的 OpenAIAdapter"""
    # 从 messages 中提取系统提示和最后一条用户消息
    system_prompt = ""
    user_message = ""
    for msg in req.messages:
        if msg.role == "system":
            system_prompt = msg.content
        elif msg.role == "user":
            user_message = msg.content

    if not user_message:
        raise HTTPException(status_code=400, detail="No user message found")

    # 根据 model 名推断质量等级
    # 支持真实模型名（gpt-4o, deepseek-v3 等）用于实验系统的模型变量对比
    quality = model_to_quality(req.model)

    # temperature 影响回答的随机性：低温更确定性，高温更随机
    effective_temp = req.temperature or 0.7
    if effective_temp <= 0.2:
        # 低温度：更确定性，如果本来是 high 就保持 high
        pass
    elif effective_temp >= 0.8:
        # 高温度：增加随机性，有概率降级回答质量
        if quality == "high" and random.random() < 0.3:
            quality = "medium"

    try:
        result = generate_answer(user_message, quality, system_prompt)
        # 在回答中注入模型信息，方便实验结果区分
        result["model_used"] = req.model
        result["temperature_used"] = effective_temp
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))

    # 构造 OpenAI 兼容的 tool_calls 格式
    openai_tool_calls = []
    for tc in result["tool_calls"]:
        openai_tool_calls.append({
            "id": f"call_{uuid.uuid4().hex[:8]}",
            "type": "function",
            "function": {
                "name": tc["name"],
                "arguments": tc["arguments"],
            },
        })

    message_body: Dict[str, Any] = {
        "role": "assistant",
        "content": result["content"],
    }
    if openai_tool_calls:
        message_body["tool_calls"] = openai_tool_calls

    prompt_tokens = sum(len(m.content) for m in req.messages) // 4
    completion_tokens = len(result["content"]) // 4

    return OpenAIChatResponse(
        id=f"chatcmpl-{uuid.uuid4().hex[:12]}",
        created=int(time.time()),
        model=req.model,
        choices=[
            {
                "index": 0,
                "message": message_body,
                "finish_reason": "stop",
            }
        ],
        usage={
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens,
        },
    )


# =============================================================================
# 辅助接口
# =============================================================================

@app.get("/health")
async def health():
    """健康检查"""
    return {"status": "ok", "service": "test-agent", "version": "1.0.0"}


@app.get("/api/tools")
async def list_tools():
    """列出可用工具（方便调试）"""
    return {"tools": TOOLS_REGISTRY}


@app.get("/api/knowledge")
async def list_knowledge():
    """列出知识库主题（方便调试）"""
    return {"topics": list(KNOWLEDGE_BASE.keys())}


@app.get("/")
async def root():
    return {
        "name": "Test Agent for Eval Platform",
        "version": "1.0.0",
        "endpoints": {
            "HTTP 通用接口": "POST /api/chat",
            "OpenAI 兼容接口": "POST /v1/chat/completions",
            "健康检查": "GET /health",
            "可用工具": "GET /api/tools",
            "知识库主题": "GET /api/knowledge",
        },
        "usage": {
            "注册为 HTTP Agent": {
                "agent_type": "http",
                "agent_config": {
                    "url": "http://localhost:8900/api/chat",
                    "method": "POST",
                    "request_template": {"message": "{{input}}"},
                    "response_path": "content",
                },
            },
            "注册为 OpenAI Agent": {
                "agent_type": "openai",
                "agent_config": {
                    "base_url": "http://localhost:8900/v1",
                    "api_key": "test-key",
                    "model": "test-agent-v1",
                },
            },
        },
    }
