"""可观测性 API - 提供 Trace/Span 查询和聚合统计

替代原 langfuse_proxy.py，基于本地 traces/spans 表提供：
- Trace 列表 + 详情 + Span 树
- 延迟百分位统计
- Token 消耗统计
- 工具调用统计
- 模型使用统计
- 成本统计
"""
import math
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Query

from app.core.database import prisma
from app.core.logging import get_logger

logger = get_logger("observability")

router = APIRouter(prefix="/observability", tags=["Observability"])


# ============================================================
# Trace CRUD
# ============================================================

@router.get("/traces")
async def list_traces(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    agent_id: Optional[str] = None,
    source: Optional[str] = None,
    status: Optional[str] = None,
    name: Optional[str] = None,
    session_id: Optional[str] = None,
    days: int = Query(7, ge=1, le=90),
):
    """列出 Trace 列表，支持多种过滤条件"""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    where: Dict[str, Any] = {"createdAt": {"gte": since}}
    if agent_id:
        where["agentId"] = agent_id
    if source:
        where["source"] = source
    if status:
        where["status"] = status
    if name:
        where["name"] = {"contains": name}
    if session_id:
        where["sessionId"] = session_id

    total = await prisma.trace.count(where=where)
    traces = await prisma.trace.find_many(
        where=where,
        order={"createdAt": "desc"},
        skip=(page - 1) * limit,
        take=limit,
        include={"agent": True},
    )

    return {
        "data": [_serialize_trace(t) for t in traces],
        "total": total,
        "page": page,
        "limit": limit,
        "pages": math.ceil(total / limit) if limit > 0 else 0,
    }


@router.get("/traces/{trace_id}")
async def get_trace_detail(trace_id: str):
    """获取 Trace 详情 + 完整 Span 树"""
    trace = await prisma.trace.find_unique(
        where={"id": trace_id},
        include={"agent": True, "spans": True, "evalResults": True},
    )
    if not trace:
        raise HTTPException(status_code=404, detail="Trace not found")

    # 构建 Span 树
    span_tree = _build_span_tree(trace.spans) if trace.spans else []

    result = _serialize_trace(trace)
    result["spans"] = span_tree
    result["eval_results"] = [
        {
            "id": er.id,
            "test_case_id": er.testCaseId,
            "overall_score": er.overallScore,
            "passed": er.passed,
            "scores": er.scores if er.scores else {},
            "reasoning": er.reasoning if hasattr(er, "reasoning") else None,
            "created_at": er.createdAt.isoformat() if er.createdAt else None,
        }
        for er in (trace.evalResults or [])
    ]

    return result


# ============================================================
# 聚合统计
# ============================================================

@router.get("/stats/overview")
async def get_overview_stats(
    agent_id: Optional[str] = None,
    days: int = Query(7, ge=1, le=90),
):
    """总览统计：Trace 总数、成功率、平均延迟、Token 消耗等（SQL 聚合，避免 OOM）"""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    # 构建 SQL 条件
    conditions = ["created_at >= ?"]
    params: list = [since]
    if agent_id:
        conditions.append("agent_id = ?")
        params.append(agent_id)
    where_clause = " AND ".join(conditions)

    sql = f"""
        SELECT
            COUNT(*) as total_traces,
            SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) as ok_count,
            SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END) as error_count,
            AVG(CASE WHEN total_latency_ms > 0 THEN total_latency_ms END) as avg_latency_ms,
            SUM(COALESCE(total_tokens, 0)) as total_tokens,
            SUM(COALESCE(prompt_tokens, 0)) as total_prompt_tokens,
            SUM(COALESCE(completion_tokens, 0)) as total_completion_tokens,
            SUM(COALESCE(total_cost, 0)) as total_cost,
            SUM(COALESCE(llm_call_count, 0)) as total_llm_calls,
            SUM(COALESCE(tool_call_count, 0)) as total_tool_calls
        FROM traces
        WHERE {where_clause}
    """

    results = await prisma.query_raw(sql, *params)
    row = results[0] if results else {}

    total = int(row.get("total_traces", 0) or 0)
    ok_count = int(row.get("ok_count", 0) or 0)
    error_count = int(row.get("error_count", 0) or 0)
    avg_latency = float(row.get("avg_latency_ms", 0) or 0)
    total_tokens = int(row.get("total_tokens", 0) or 0)
    total_prompt = int(row.get("total_prompt_tokens", 0) or 0)
    total_completion = int(row.get("total_completion_tokens", 0) or 0)
    total_cost = float(row.get("total_cost", 0) or 0)
    llm_calls = int(row.get("total_llm_calls", 0) or 0)
    tool_calls = int(row.get("total_tool_calls", 0) or 0)

    # 延迟百分位数需要单独查询（MySQL 8.0 无原生 PERCENTILE 函数）
    lat_sql = f"""
        SELECT total_latency_ms
        FROM traces
        WHERE {where_clause} AND total_latency_ms IS NOT NULL AND total_latency_ms > 0
        ORDER BY total_latency_ms
    """
    lat_rows = await prisma.query_raw(lat_sql, *params)
    latencies = [float(r["total_latency_ms"]) for r in lat_rows]

    return {
        "total_traces": total,
        "ok_count": ok_count,
        "error_count": error_count,
        "success_rate": round(ok_count / total, 4) if total > 0 else 0,
        "avg_latency_ms": round(avg_latency, 1),
        "latency_percentiles": _percentiles_ms(latencies),
        "total_tokens": total_tokens,
        "total_prompt_tokens": total_prompt,
        "total_completion_tokens": total_completion,
        "total_cost": round(total_cost, 6),
        "total_llm_calls": llm_calls,
        "total_tool_calls": tool_calls,
        "avg_llm_calls_per_trace": round(llm_calls / total, 2) if total > 0 else 0,
        "avg_tool_calls_per_trace": round(tool_calls / total, 2) if total > 0 else 0,
        "days": days,
    }


@router.get("/stats/latency")
async def get_latency_stats(
    agent_id: Optional[str] = None,
    days: int = Query(7, ge=1, le=90),
):
    """延迟统计：按名称分组的百分位数 + 延迟分布（SQL 聚合，避免 OOM）"""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    # Trace 延迟 - 按名称分组的聚合统计
    conditions = ["t.created_at >= ?", "t.total_latency_ms IS NOT NULL", "t.total_latency_ms > 0"]
    params: list = [since]
    if agent_id:
        conditions.append("t.agent_id = ?")
        params.append(agent_id)
    where_clause = " AND ".join(conditions)

    trace_agg_sql = f"""
        SELECT name, COUNT(*) as cnt,
            AVG(total_latency_ms / 1000.0) as avg_lat
        FROM traces t
        WHERE {where_clause}
        GROUP BY name
        ORDER BY avg_lat DESC
    """
    trace_groups = await prisma.query_raw(trace_agg_sql, *params)

    # 获取所有 trace 延迟用于百分位数和分布（仅取 latency 值，不加载完整对象）
    trace_lat_sql = f"""
        SELECT name, total_latency_ms / 1000.0 as lat_s
        FROM traces t
        WHERE {where_clause}
        ORDER BY total_latency_ms
    """
    trace_lat_rows = await prisma.query_raw(trace_lat_sql, *params)

    # 按名称分组计算百分位
    name_latencies: Dict[str, List[float]] = {}
    all_latencies: List[float] = []
    for r in trace_lat_rows:
        lat = float(r["lat_s"])
        name_latencies.setdefault(r["name"], []).append(lat)
        all_latencies.append(lat)

    trace_table = []
    for name, lats in name_latencies.items():
        pcts = _percentiles(sorted(lats))
        trace_table.append({"name": name, "count": len(lats), **pcts})
    trace_table.sort(key=lambda x: x.get("p95", 0), reverse=True)

    # Span 延迟 by kind (SQL 聚合)
    span_conditions = ["s.latency_ms IS NOT NULL", "s.latency_ms > 0"]
    span_params: list = []
    if agent_id:
        span_conditions.append("s.trace_id IN (SELECT id FROM traces WHERE agent_id = ? AND created_at >= ?)")
        span_params.extend([agent_id, since])
    else:
        span_conditions.append("s.trace_id IN (SELECT id FROM traces WHERE created_at >= ?)")
        span_params.append(since)
    span_where = " AND ".join(span_conditions)

    span_lat_sql = f"""
        SELECT s.kind, s.latency_ms / 1000.0 as lat_s
        FROM spans s
        WHERE {span_where}
        ORDER BY s.latency_ms
    """
    span_lat_rows = await prisma.query_raw(span_lat_sql, *span_params)

    kind_latencies: Dict[str, List[float]] = {}
    for r in span_lat_rows:
        kind_latencies.setdefault(r["kind"], []).append(float(r["lat_s"]))

    span_table = []
    for kind, lats in kind_latencies.items():
        pcts = _percentiles(sorted(lats))
        span_table.append({"kind": kind, "count": len(lats), **pcts})

    # 延迟分布
    distribution = {"fast": 0, "medium": 0, "slow": 0, "very_slow": 0}
    for lat in all_latencies:
        if lat < 5:
            distribution["fast"] += 1
        elif lat < 15:
            distribution["medium"] += 1
        elif lat < 30:
            distribution["slow"] += 1
        else:
            distribution["very_slow"] += 1

    return {
        "trace_latency_table": trace_table,
        "span_latency_by_kind": span_table,
        "latency_distribution": distribution,
        "overall_percentiles": _percentiles(all_latencies),
    }


@router.get("/stats/tokens")
async def get_token_stats(
    agent_id: Optional[str] = None,
    days: int = Query(7, ge=1, le=90),
):
    """Token 消耗统计：按模型分组（SQL 聚合，避免 OOM）"""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    conditions = ["s.kind = 'llm'", "s.llm_model IS NOT NULL"]
    params: list = []
    if agent_id:
        conditions.append("s.trace_id IN (SELECT id FROM traces WHERE agent_id = ? AND created_at >= ?)")
        params.extend([agent_id, since])
    else:
        conditions.append("s.trace_id IN (SELECT id FROM traces WHERE created_at >= ?)")
        params.append(since)
    where_clause = " AND ".join(conditions)

    sql = f"""
        SELECT
            s.llm_model as model,
            COUNT(*) as cnt,
            SUM(COALESCE(s.llm_prompt_tokens, 0)) as prompt_tokens,
            SUM(COALESCE(s.llm_completion_tokens, 0)) as completion_tokens,
            SUM(COALESCE(s.llm_total_tokens, 0)) as total_tokens,
            SUM(COALESCE(s.llm_cost, 0)) as total_cost
        FROM spans s
        WHERE {where_clause}
        GROUP BY s.llm_model
        ORDER BY total_tokens DESC
    """
    rows = await prisma.query_raw(sql, *params)

    model_table = []
    total_spans = 0
    for r in rows:
        cnt = int(r.get("cnt", 0) or 0)
        total_spans += cnt
        model_table.append({
            "model": r["model"],
            "count": cnt,
            "prompt_tokens": int(r.get("prompt_tokens", 0) or 0),
            "completion_tokens": int(r.get("completion_tokens", 0) or 0),
            "total_tokens": int(r.get("total_tokens", 0) or 0),
            "total_cost": float(r.get("total_cost", 0) or 0),
        })

    return {
        "model_usage_table": model_table,
        "total_models": len(model_table),
        "total_llm_spans": total_spans,
    }


@router.get("/stats/tools")
async def get_tool_stats(
    agent_id: Optional[str] = None,
    days: int = Query(7, ge=1, le=90),
):
    """工具调用统计（SQL 聚合，避免 OOM）"""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    conditions = ["s.kind = 'tool'"]
    params: list = []
    if agent_id:
        conditions.append("s.trace_id IN (SELECT id FROM traces WHERE agent_id = ? AND created_at >= ?)")
        params.extend([agent_id, since])
    else:
        conditions.append("s.trace_id IN (SELECT id FROM traces WHERE created_at >= ?)")
        params.append(since)
    where_clause = " AND ".join(conditions)

    sql = f"""
        SELECT
            COALESCE(s.tool_name, s.name) as tool_name,
            COUNT(*) as cnt,
            SUM(CASE WHEN s.tool_status = 'error' OR s.status = 'error' THEN 1 ELSE 0 END) as error_count,
            SUM(CASE WHEN s.tool_status != 'error' AND s.status != 'error' THEN 1 ELSE 0 END) as success_count,
            AVG(CASE WHEN s.latency_ms > 0 THEN s.latency_ms END) as avg_latency_ms
        FROM spans s
        WHERE {where_clause}
        GROUP BY COALESCE(s.tool_name, s.name)
        ORDER BY cnt DESC
    """
    rows = await prisma.query_raw(sql, *params)

    tool_table = []
    total_calls = 0
    for r in rows:
        cnt = int(r.get("cnt", 0) or 0)
        total_calls += cnt
        success = int(r.get("success_count", 0) or 0)
        tool_table.append({
            "name": r["tool_name"] or "unknown",
            "count": cnt,
            "success": success,
            "error": int(r.get("error_count", 0) or 0),
            "success_rate": round(success / cnt, 4) if cnt > 0 else 0,
            "avg_latency_ms": round(float(r.get("avg_latency_ms", 0) or 0), 1),
        })

    return {
        "tool_usage_table": tool_table,
        "total_tool_calls": total_calls,
    }


@router.get("/stats/timeline")
async def get_timeline_stats(
    agent_id: Optional[str] = None,
    days: int = Query(7, ge=1, le=90),
    granularity: str = Query("day", regex="^(hour|day)$"),
):
    """时间线统计：按时间粒度聚合 Trace 数量和延迟趋势（SQL 聚合，避免 OOM）"""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    conditions = ["created_at >= ?"]
    params: list = [since]
    if agent_id:
        conditions.append("agent_id = ?")
        params.append(agent_id)
    where_clause = " AND ".join(conditions)

    if granularity == "hour":
        time_expr = "DATE_FORMAT(created_at, '%Y-%m-%d %H:00')"
    else:
        time_expr = "DATE_FORMAT(created_at, '%Y-%m-%d')"

    sql = f"""
        SELECT
            {time_expr} as time_bucket,
            COUNT(*) as cnt,
            SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) as ok_count,
            SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END) as error_count,
            AVG(CASE WHEN total_latency_ms > 0 THEN total_latency_ms END) as avg_latency_ms,
            SUM(COALESCE(total_tokens, 0)) as total_tokens
        FROM traces
        WHERE {where_clause}
        GROUP BY time_bucket
        ORDER BY time_bucket ASC
    """
    rows = await prisma.query_raw(sql, *params)

    timeline = []
    for r in rows:
        timeline.append({
            "time": r["time_bucket"],
            "count": int(r.get("cnt", 0) or 0),
            "ok": int(r.get("ok_count", 0) or 0),
            "error": int(r.get("error_count", 0) or 0),
            "avg_latency_ms": round(float(r.get("avg_latency_ms", 0) or 0), 1),
            "tokens": int(r.get("total_tokens", 0) or 0),
        })

    return {"timeline": timeline, "granularity": granularity}


# ============================================================
# 兼容旧 Langfuse Proxy 格式的接口（过渡期）
# ============================================================

@router.get("/observations/stats")
async def get_observations_stats_compat(
    agent_id: Optional[str] = None,
    days: int = Query(7, ge=1, le=90),
):
    """
    兼容旧 langfuse_proxy /observations/stats 格式（SQL 聚合，避免 OOM）。
    返回与旧接口相同结构的数据，便于前端平滑迁移。
    """
    since = datetime.now(timezone.utc) - timedelta(days=days)

    # 构建 trace/span 过滤条件
    t_conditions = ["t.created_at >= ?"]
    t_params: list = [since]
    if agent_id:
        t_conditions.append("t.agent_id = ?")
        t_params.append(agent_id)
    t_where = " AND ".join(t_conditions)

    s_conditions: list = []
    s_params: list = []
    if agent_id:
        s_conditions.append("s.trace_id IN (SELECT id FROM traces WHERE agent_id = ? AND created_at >= ?)")
        s_params.extend([agent_id, since])
    else:
        s_conditions.append("s.trace_id IN (SELECT id FROM traces WHERE created_at >= ?)")
        s_params.append(since)
    s_where = " AND ".join(s_conditions)

    # 1. 总数统计
    count_sql = f"""
        SELECT
            (SELECT COUNT(*) FROM traces t WHERE {t_where}) as total_traces,
            (SELECT COUNT(*) FROM spans s WHERE {s_where}) as total_observations
    """
    count_result = await prisma.query_raw(count_sql, *(t_params + s_params))
    count_row = count_result[0] if count_result else {}
    total_traces = int(count_row.get("total_traces", 0) or 0)
    total_obs = int(count_row.get("total_observations", 0) or 0)

    # 2. Trace 延迟（仅取延迟值，不加载完整对象）
    trace_lat_sql = f"""
        SELECT t.name, t.total_latency_ms / 1000.0 as lat_s
        FROM traces t
        WHERE {t_where} AND t.total_latency_ms IS NOT NULL AND t.total_latency_ms > 0
        ORDER BY t.total_latency_ms
    """
    trace_lat_rows = await prisma.query_raw(trace_lat_sql, *t_params)

    trace_latencies: Dict[str, List[float]] = {}
    for r in trace_lat_rows:
        trace_latencies.setdefault(r["name"], []).append(float(r["lat_s"]))

    trace_table = []
    for name, lats in trace_latencies.items():
        pcts = _percentiles(sorted(lats))
        trace_table.append({"name": name, "count": len(lats), **pcts})
    trace_table.sort(key=lambda x: x.get("p95", 0), reverse=True)

    # 3. Span 统计（SQL 分组聚合 + 延迟值查询）
    # LLM spans 延迟
    llm_lat_sql = f"""
        SELECT s.name, s.llm_model, s.latency_ms / 1000.0 as lat_s
        FROM spans s
        WHERE {s_where} AND s.kind = 'llm' AND s.latency_ms IS NOT NULL AND s.latency_ms > 0
        ORDER BY s.latency_ms
    """
    llm_lat_rows = await prisma.query_raw(llm_lat_sql, *s_params)

    gen_latencies: Dict[str, List[float]] = {}
    model_latencies: Dict[str, List[float]] = {}
    for r in llm_lat_rows:
        lat = float(r["lat_s"])
        gen_latencies.setdefault(r["name"], []).append(lat)
        if r.get("llm_model"):
            model_latencies.setdefault(r["llm_model"], []).append(lat)

    gen_table = [{"name": n, "count": len(l), **_percentiles(sorted(l))} for n, l in gen_latencies.items()]
    gen_table.sort(key=lambda x: x.get("p95", 0), reverse=True)

    model_lat_table = [{"name": m, "model": m, "count": len(l), **_percentiles(sorted(l))} for m, l in model_latencies.items()]
    model_lat_table.sort(key=lambda x: x.get("p95", 0), reverse=True)

    # Model token 统计 (SQL 聚合)
    model_token_sql = f"""
        SELECT
            s.llm_model as model,
            SUM(COALESCE(s.llm_prompt_tokens, 0)) as prompt_tokens,
            SUM(COALESCE(s.llm_completion_tokens, 0)) as completion_tokens,
            SUM(COALESCE(s.llm_total_tokens, 0)) as total_tokens,
            COUNT(*) as cnt
        FROM spans s
        WHERE {s_where} AND s.kind = 'llm' AND s.llm_model IS NOT NULL
        GROUP BY s.llm_model
        ORDER BY total_tokens DESC
    """
    model_token_rows = await prisma.query_raw(model_token_sql, *s_params)
    model_usage_table = [{
        "model": r["model"],
        "count": int(r.get("cnt", 0) or 0),
        "prompt_tokens": int(r.get("prompt_tokens", 0) or 0),
        "completion_tokens": int(r.get("completion_tokens", 0) or 0),
        "total_tokens": int(r.get("total_tokens", 0) or 0),
    } for r in model_token_rows]

    # Non-LLM, non-tool span 延迟
    other_lat_sql = f"""
        SELECT s.name, s.latency_ms / 1000.0 as lat_s
        FROM spans s
        WHERE {s_where} AND s.kind NOT IN ('llm', 'tool') AND s.latency_ms IS NOT NULL AND s.latency_ms > 0
        ORDER BY s.latency_ms
    """
    other_lat_rows = await prisma.query_raw(other_lat_sql, *s_params)

    span_latencies: Dict[str, List[float]] = {}
    for r in other_lat_rows:
        span_latencies.setdefault(r["name"], []).append(float(r["lat_s"]))

    span_table = [{"name": n, "count": len(l), **_percentiles(sorted(l))} for n, l in span_latencies.items()]
    span_table.sort(key=lambda x: x.get("p95", 0), reverse=True)

    # Tool 统计 (SQL 聚合)
    tool_sql = f"""
        SELECT COALESCE(s.tool_name, s.name) as tool_name, COUNT(*) as cnt
        FROM spans s
        WHERE {s_where} AND s.kind = 'tool'
        GROUP BY COALESCE(s.tool_name, s.name)
        ORDER BY cnt DESC
    """
    tool_rows = await prisma.query_raw(tool_sql, *s_params)
    tool_usage_table = [{"name": r["tool_name"] or "unknown", "count": int(r.get("cnt", 0) or 0)} for r in tool_rows]

    # 延迟分布
    all_lats: List[float] = []
    for lats in trace_latencies.values():
        all_lats.extend(lats)
    distribution = {"fast": 0, "medium": 0, "slow": 0, "very_slow": 0}
    for lat in all_lats:
        if lat < 5:
            distribution["fast"] += 1
        elif lat < 15:
            distribution["medium"] += 1
        elif lat < 30:
            distribution["slow"] += 1
        else:
            distribution["very_slow"] += 1

    return {
        "total_traces": total_traces,
        "total_observations": total_obs,
        "trace_latency_table": trace_table,
        "generation_latency_table": gen_table,
        "span_latency_table": span_table,
        "model_latency_table": model_lat_table,
        "model_usage_table": model_usage_table,
        "latency_distribution": distribution,
        "tool_usage_table": tool_usage_table,
        "total_tool_calls": sum(t["count"] for t in tool_usage_table),
    }


# ============================================================
# Helper functions
# ============================================================

def _serialize_trace(t) -> Dict[str, Any]:
    """序列化 Trace 对象"""
    return {
        "id": t.id,
        "agent_id": t.agentId,
        "agent_name": t.agent.name if t.agent else None,
        "source": t.source,
        "name": t.name,
        "input": t.input[:500] if t.input and len(t.input) > 500 else t.input,
        "output": t.output[:500] if t.output and len(t.output) > 500 else t.output,
        "status": t.status,
        "total_latency_ms": t.totalLatencyMs,
        "total_tokens": t.totalTokens,
        "prompt_tokens": t.promptTokens,
        "completion_tokens": t.completionTokens,
        "total_cost": t.totalCost,
        "llm_call_count": t.llmCallCount,
        "tool_call_count": t.toolCallCount,
        "session_id": t.sessionId,
        "user_id": t.userId,
        "metadata": t.metadata,
        "tags": t.tags,
        "start_time": t.startTime.isoformat() if t.startTime else None,
        "end_time": t.endTime.isoformat() if t.endTime else None,
        "created_at": t.createdAt.isoformat() if t.createdAt else None,
    }


def _serialize_span(s) -> Dict[str, Any]:
    """序列化 Span 对象"""
    result = {
        "id": s.id,
        "trace_id": s.traceId,
        "parent_span_id": s.parentSpanId,
        "name": s.name,
        "kind": s.kind,
        "status": s.status,
        "status_message": s.statusMessage,
        "start_time": s.startTime.isoformat() if s.startTime else None,
        "end_time": s.endTime.isoformat() if s.endTime else None,
        "latency_ms": s.latencyMs,
        "input": s.input,
        "output": s.output,
        "attributes": s.attributes,
        "events": s.events,
    }

    if s.kind == "llm":
        result.update({
            "llm_model": s.llmModel,
            "llm_prompt": s.llmPrompt,
            "llm_completion": s.llmCompletion,
            "llm_prompt_tokens": s.llmPromptTokens,
            "llm_completion_tokens": s.llmCompletionTokens,
            "llm_total_tokens": s.llmTotalTokens,
            "llm_temperature": s.llmTemperature,
            "llm_cost": s.llmCost,
            "llm_finish_reason": s.llmFinishReason,
        })
    elif s.kind == "tool":
        result.update({
            "tool_name": s.toolName,
            "tool_input": s.toolInput,
            "tool_output": s.toolOutput,
            "tool_status": s.toolStatus,
        })
    elif s.kind == "retrieval":
        result.update({
            "retrieval_query": s.retrievalQuery,
            "retrieval_doc_count": s.retrievalDocCount,
            "retrieval_documents": s.retrievalDocuments,
        })

    return result


def _build_span_tree(spans) -> List[Dict[str, Any]]:
    """将 flat span list 构建为树形结构"""
    span_map: Dict[str, Dict[str, Any]] = {}
    for s in spans:
        node = _serialize_span(s)
        node["children"] = []
        span_map[s.id] = node

    roots = []
    for s in spans:
        node = span_map[s.id]
        if s.parentSpanId and s.parentSpanId in span_map:
            span_map[s.parentSpanId]["children"].append(node)
        else:
            roots.append(node)

    # 按 start_time 排序
    roots.sort(key=lambda x: x.get("start_time") or "")
    for node in span_map.values():
        node["children"].sort(key=lambda x: x.get("start_time") or "")

    return roots


def _percentiles(values: List[float], ps: List[int] = None) -> Dict[str, float]:
    """计算百分位数"""
    if ps is None:
        ps = [50, 90, 95, 99]
    if not values:
        return {f"p{p}": 0 for p in ps}
    sorted_vals = sorted(values)
    n = len(sorted_vals)
    result = {}
    for p in ps:
        k = (p / 100) * (n - 1)
        f_idx = math.floor(k)
        c_idx = math.ceil(k)
        if f_idx == c_idx:
            result[f"p{p}"] = round(sorted_vals[int(k)], 3)
        else:
            result[f"p{p}"] = round(sorted_vals[f_idx] + (k - f_idx) * (sorted_vals[c_idx] - sorted_vals[f_idx]), 3)
    return result


def _percentiles_ms(values: List[int], ps: List[int] = None) -> Dict[str, float]:
    """计算毫秒级百分位数"""
    return _percentiles([float(v) for v in values], ps)
