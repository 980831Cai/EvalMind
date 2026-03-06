# Agent 评估框架设计文档

> **版本**：2.0.0 &nbsp;|&nbsp; **日期**：2026-02-26  
> **定位**：Agent 评测平台核心评估引擎的完整设计方案  
> **设计理念**：**评估工具箱，而非万能评估器** —— 平台不替用户定义什么是"好"，而是提供灵活、可组合的评估工具，让用户根据自身业务场景构建评估体系。  
> **v2.0 更新说明**：综合 Anthropic、AgentBench、τ-bench、SWE-bench、METR 等最新评测研究，以及 DeepEval、Braintrust、Ragas、PromptFoo、LangSmith 等主流工具框架的调研结论，对 v1.0 进行全面增补与优化。

---

## 目录

1. [框架定位与设计理念](#一框架定位与设计理念)
2. [评估分类体系：确定性 vs 非确定性](#二评估分类体系确定性-vs-非确定性)
3. [评估维度全景图：三层模型](#三评估维度全景图三层模型)
4. [三级评分策略矩阵](#四三级评分策略矩阵)
5. [Trace / 轨迹中间过程评估方案](#五trace--轨迹中间过程评估方案)
6. [稳定性评估方案：Pass@K 与多轮一致性](#六稳定性评估方案passк-与多轮一致性)
7. [跨模型对比方案](#七跨模型对比方案)
8. [用户自定义断言机制](#八用户自定义断言机制)
9. [回归测试体系](#九回归测试体系)
10. [Bad Case 管理闭环](#十bad-case-管理闭环)
11. [Skills 健康度分析](#十一skills-健康度分析)
12. [LLM-as-Judge 偏见缓解机制](#十二llm-as-judge-偏见缓解机制)
13. [可验证环境评估（沙箱模式）](#十三可验证环境评估沙箱模式)
14. [数据流与系统架构](#十四数据流与系统架构)
15. [评估模板系统](#十五评估模板系统)
16. [智能优化建议](#十六智能优化建议)
17. [平台现状与改造路径](#十七平台现状与改造路径)

---

## 一、框架定位与设计理念

### 1.1 核心问题

Agent 评估的核心难题：**不同场景下的特定业务 Agent 难以统一评估**。

- 客服 Agent 的"好回答"与代码 Agent 的"好回答"标准完全不同
- 用户的业务规则千差万别，平台无法穷举所有评估标准
- 纯粹依赖 LLM 评分既不稳定也不透明，用户无法理解为何得了这个分
- 单次评测的绝对分数意义有限，用户更关心的是"改了之后是不是更好了"

### 1.2 设计理念

**四个核心原则：**

| 原则 | 含义 | 具体体现 |
|------|------|---------|
| **确定性优先** | 能用代码判定的不用 LLM | 关键词/格式/工具调用/延迟/token 等指标全部程序化评分 |
| **用户定义标准** | 平台提供工具，用户定义规则 | 自定义断言机制，让用户用声明式方式定义业务规则 |
| **变化驱动** | 关注"变化"而非"绝对分数" | 回归测试体系，基线对比突出退化和改善 |
| **可靠性第一** | 评测结果本身必须可信 | Judge 偏见缓解、Pass@K 稳定性指标、多评估者共识机制 |

**不做什么：**
- 不试图发明一个"通用 Agent 评分标准"——这不存在
- 不把 LLM 评分当作唯一手段——它不稳定且昂贵
- 不给用户一个绝对分数就了事——需要告诉用户"哪里好，哪里差，怎么改"
- 不用单次运行结果代表 Agent 能力——单次成功不等于可靠

### 1.3 参考框架与调研来源

#### 学术与行业研究

| 来源 | 核心启发 |
|------|---------|
| **Anthropic** "Building Effective Agents" | 从 20 个失败案例开始；代码评分 → LLM 评分 → 人工评分三级体系；能力评估 vs 回归评估分离 |
| **AWS** Agent 质量评估白皮书 | 三大指标体系（业务/效率/安全）；四种评估框架（自建/开源/商用/托管）；程序化指标和人工评估并行 |
| **SWE-bench / SWE-bench Verified**（Princeton + OpenAI） | 可验证端到端任务评估；FAIL_TO_PASS + PASS_TO_PASS 双测试保证；Docker 容器化环境确保结果可复现 |
| **τ-bench / τ²-bench** | 真实工具-用户交互场景；Pass@K 指标揭示单次成功率的欺骗性（发布时 Pass@8 < 25%）；数据库状态比对作为 ground truth |
| **AgentBench**（清华 ChatGLM 团队） | 5 类真实环境仿真（OS/DB/KG/Web/游戏）；多环境加权综合得分；环境隔离保证评估一致性 |
| **PaperBench**（OpenAI） | 8316 个可分级子任务评估 AI 复现论文能力；与论文作者共同制定评分标准 |
| **METR Vivaria 平台** | 完整的 Agent 能力评测与威胁研究平台；沙箱隔离 + 任务环境启动的工程化实现 |
| **LangChain/LangSmith 三层评估体系** | 最终响应评估 → 单步 tool call 评估 → 完整轨迹评估；支持团队协作标注 |

#### 主流工具框架调研

| 工具 | 可借鉴设计点 |
|------|------------|
| **DeepEval** | G-Eval 的参数化设计（evaluation_steps + rubric）；15+ 内置指标的指标体系；Pytest 风格 CI/CD 集成 |
| **Braintrust** | 在线+离线评估双轨制；Dataset 版本化管理；基于 GitHub Action 的 PR 回归测试 |
| **Ragas** | RAG 四元组标准格式（question/answer/contexts/ground_truths）；Claim decomposition 忠实度算法；检索端与生成端分离评估 |
| **Langfuse Evaluations** | @observe 无侵入式 Trace；Trace+Span 嵌套结构；Custom Scorer 灵活接口 |
| **PromptFoo** | YAML 配置化测试用例；矩阵式多模型对比视图；参数化测试自动生成场景 |
| **LangSmith** | Prompt 版本管理（发布/回滚/对比）；Dataset + Annotation 混合工作流；Project 容器组织模式 |

---

## 二、评估分类体系：确定性 vs 非确定性

这是本框架最核心的分类逻辑。**所有评估维度必须先归类为确定性或非确定性，然后选择对应的评分策略。**

### 2.1 确定性评估

**定义**：有明确对错标准，可通过程序化手段直接判定，结果 100% 可复现。

| 类别 | 评估项 | 判定方式 | 数据来源 |
|------|--------|---------|---------|
| **输出格式** | JSON 合法性 | `json.loads()` 尝试解析 | Agent 输出 |
| | 字数限制（最大/最小） | `len(output)` | Agent 输出 |
| | 正则匹配 | `re.match(pattern, output)` | Agent 输出 |
| **关键词** | 必须包含的关键词 | `keyword in output` | Agent 输出 |
| | 不能包含的关键词 | `keyword not in output` | Agent 输出 |
| **工具调用** | 是否调用了指定工具 | 检查 `skills_called` 列表 | 轨迹数据 |
| | 工具调用次数约束 | `len(tool_calls) <= max` | 轨迹数据 |
| | 工具调用顺序 | LCS 序列比对 | 轨迹数据 |
| | 工具参数格式 | JSON Schema 校验 | 轨迹数据 |
| **性能指标** | 端到端延迟 | `latency_ms <= threshold` | 执行时间 |
| | Token 消耗量 | `total_tokens <= budget` | API 返回 |
| | 各步骤耗时分布 | 从 Trace 提取 | Langfuse Trace |
| **行为模式** | 是否产生思考步骤 | 检查 trajectory 是否有 thinking 类型 | 轨迹数据 |
| | 是否有冗余步骤 | 重复工具调用检测 | 轨迹数据 |
| | 错误后是否重试 | tool_result 异常后检查后续步骤 | 轨迹数据 |
| **精确匹配** | 输出与期望完全一致 | `output == expected` | Agent 输出 |

**特征**：零成本、即时返回、结果确定、可批量执行。

### 2.2 非确定性评估

**定义**：无唯一正确答案，需要主观判断或语义理解，结果可能因评估者不同而有差异。

| 类别 | 评估项 | 判定方式 | 说明 |
|------|--------|---------|------|
| **语义质量** | 回答准确性 | LLM-as-Judge | 信息是否正确、与参考答案语义是否一致 |
| | 回答完整性 | LLM-as-Judge | 是否覆盖问题的所有方面 |
| | 回答相关性 | LLM-as-Judge | 是否紧扣主题，没有跑题 |
| | 回答实用性 | LLM-as-Judge | 是否对用户有实际帮助 |
| **安全性** | 幻觉检测 | LLM-as-Judge | 是否编造不存在的信息 |
| | 有害内容 | LLM-as-Judge + 规则 | 是否输出有害/不当内容 |
| | 隐私保护 | LLM-as-Judge + 规则 | 是否泄露敏感信息 |
| **指令遵循** | 风格/语气 | LLM-as-Judge | 是否按要求的风格回答 |
| | 角色一致性 | LLM-as-Judge | 是否保持设定的角色 |
| **轨迹推理** | 决策合理性 | LLM-as-Judge | 每步决策是否有逻辑依据 |
| | 工具结果利用 | LLM-as-Judge | 是否正确利用工具返回值 |
| **语义断言** | 与参考答案语义等价 | LLM-as-Judge | 用户定义的语义级断言 |

**特征**：需要 LLM API 调用、有成本、结果可能不完全一致、但能评估更高层面的质量。

### 2.3 为什么这个分类重要？

```
用户发起评测
  │
  ├─ 确定性评估（CodeScorer）──── 先执行，0 成本，1ms 内完成
  │    ├─ 全部通过 → 继续
  │    └─ 关键断言失败 → 快速失败，跳过 LLM 评分（省钱）
  │
  └─ 非确定性评估（LLMScorer）── 后执行，有成本，数秒完成
       └─ 维度评分 + 语义断言
```

这个执行顺序意味着：
- **如果一个 Agent 连"输出必须是 JSON"这种基本断言都过不了，就没必要花钱让 LLM 评它的"回答质量"**
- 确定性评估作为快速过滤器，大幅降低评测成本

---

## 三、评估维度全景图：三层模型

### 3.1 三层结构

```
┌─────────────────────────────────────────────────┐
│                    业务层                          │
│   用户自定义断言：业务关键词、格式约束、工具约束...     │
│   完全由用户定义，因业务而异                          │
├─────────────────────────────────────────────────┤
│                    类型层                          │
│   按 Agent 类型的预置模板维度                        │
│   客服类：解决率、满意度 | 代码类：编译通过率          │
│   RAG 类：召回精度、引用准确性 | 通用类：综合维度      │
├─────────────────────────────────────────────────┤
│                    通用层                          │
│   所有 Agent 强制执行的底线标准                       │
│   安全性 | 不幻觉 | 隐私保护                         │
│   不可关闭，平台内置                                 │
└─────────────────────────────────────────────────┘
```

### 3.2 通用层维度（Universal，强制执行）

| 维度 | 评估方式 | 说明 | 可配置项 |
|------|---------|------|---------|
| `safety` | LLM + 关键词规则 | 是否输出有害/不当/违规内容 | 敏感词列表可扩展 |
| `hallucination` | LLM | 是否编造不存在的信息 | 无 |
| `privacy` | LLM + 正则 | 是否泄露手机号/身份证/邮箱等 | 正则规则可扩展 |

通用层评估对所有 Agent 强制生效，不可跳过。即使用户没有配置任何断言，通用层也会执行。

### 3.3 类型层维度（Category，按模板选择）

**通用 Agent 模板：**

| 维度 | 评估方式 | 权重 |
|------|---------|------|
| `accuracy` | LLM | 0.25 |
| `completeness` | LLM | 0.20 |
| `helpfulness` | LLM | 0.20 |
| `relevance` | LLM | 0.15 |
| `instruction_following` | LLM | 0.20 |

**客服 Agent 模板：**

| 维度 | 评估方式 | 权重 |
|------|---------|------|
| `problem_resolution` | LLM | 0.30 |
| `response_clarity` | LLM | 0.20 |
| `empathy` | LLM | 0.15 |
| `accuracy` | LLM | 0.20 |
| `instruction_following` | LLM | 0.15 |

**代码 Agent 模板：**

| 维度 | 评估方式 | 权重 |
|------|---------|------|
| `code_correctness` | LLM + Code | 0.30 |
| `code_quality` | LLM | 0.20 |
| `completeness` | LLM | 0.20 |
| `efficiency` | Code（token/延迟） | 0.15 |
| `tool_usage` | Code（工具调用分析） | 0.15 |

**RAG Agent 模板：**

| 维度 | 评估方式 | 权重 |
|------|---------|------|
| `retrieval_relevance` | LLM | 0.25 |
| `citation_accuracy` | Code + LLM | 0.25 |
| `answer_faithfulness` | LLM | 0.25 |
| `completeness` | LLM | 0.15 |
| `conciseness` | LLM | 0.10 |

### 3.4 业务层维度（Business，用户自定义）

由用户通过断言机制定义，完全由业务场景决定。详见 [第八章：用户自定义断言机制](#八用户自定义断言机制)。

---

## 四、三级评分策略矩阵

### 4.1 三级评分器

```
┌──────────────────────────────────────────────────────────┐
│                    ScoringEngine（统一调度器）              │
│                                                          │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐          │
│   │CodeScorer│    │LLMScorer │    │HumanScorer│         │
│   │ 程序化评分 │    │ LLM 评分  │    │  人工评分  │         │
│   ├──────────┤    ├──────────┤    ├──────────┤          │
│   │成本: 0   │    │成本: $$  │    │成本: $$$$ │          │
│   │速度: 1ms │    │速度: 3-10s│    │速度: 分钟级│          │
│   │确定性:100%│    │确定性: 中 │    │确定性: 高 │          │
│   │覆盖: 有限 │    │覆盖: 广泛 │    │覆盖: 全面  │          │
│   └──────────┘    └──────────┘    └──────────┘          │
│                                                          │
│   执行顺序: CodeScorer → LLMScorer → HumanScorer(可选)   │
│   快速失败: CodeScorer 关键断言失败则跳过 LLM              │
└──────────────────────────────────────────────────────────┘
```

### 4.2 CodeScorer 详细设计

CodeScorer 负责所有确定性评估，纯 Python 实现，无外部依赖。

**支持的断言类型：**

| 断言类型 | 参数 | 评估逻辑 | 示例 |
|---------|------|---------|------|
| `contains` | `value: str` | `value in agent_output` | 回答必须包含"订单号" |
| `not_contains` | `value: str` | `value not in agent_output` | 不能提及竞品 |
| `regex_match` | `value: str` | `re.search(value, output)` | 输出包含邮箱格式 |
| `json_valid` | — | `json.loads(output)` 不抛异常 | 输出必须是合法 JSON |
| `max_length` | `value: int` | `len(output) <= value` | 回答不超过 500 字 |
| `min_length` | `value: int` | `len(output) >= value` | 回答至少 100 字 |
| `exact_match` | `value: str` | `output.strip() == value.strip()` | 精确匹配期望输出 |
| `tool_called` | `value: str` | 检查 skills_called 列表 | 必须调用 search_order 工具 |
| `tool_not_called` | `value: str` | 检查 skills_called 列表 | 不能调用 delete 工具 |
| `tool_count_max` | `value: int` | `len(tool_calls) <= value` | 工具调用不超过 3 次 |
| `tool_count_min` | `value: int` | `len(tool_calls) >= value` | 至少调用 1 次工具 |
| `latency_max` | `value: int` | `latency_ms <= value` | 响应时间不超过 5000ms |
| `token_max` | `value: int` | `total_tokens <= value` | Token 消耗不超过 2000 |
| `starts_with` | `value: str` | `output.startswith(value)` | 回答必须以"您好"开头 |
| `ends_with` | `value: str` | `output.endswith(value)` | 回答必须以问候结尾 |

**CodeScorer 执行特性：**
- 所有断言独立执行，互不影响
- 每条断言返回 `{passed: bool, reason: str}`
- 总耗时 < 1ms（纯字符串/正则操作）
- 支持标记"关键断言"——关键断言失败触发快速失败

### 4.3 LLMScorer 详细设计

LLMScorer 负责非确定性评估，复用现有 `judge.py` 的 LLM 调用链路。

**核心改进（相对现有实现）：**

1. **Prompt 动态构建**：从维度定义（`EvalDimension` 表）动态构建评分 Prompt，不再硬编码维度描述
2. **语义断言支持**：新增 `semantic_match` 断言类型，由 LLM 判断 Agent 输出是否与参考文本语义等价
3. **评分标准细化**：每个维度可配置独立的评分标准文本（`scoring_criteria`），而非通用描述

**LLMScorer 的输入：**
- Agent 输出文本
- 期望输出（参考答案）
- 活跃的维度列表及其评分标准
- 语义断言列表
- 工具调用记录（如有）

**LLMScorer 的输出：**
- 每个维度的得分（0-1）
- 每条语义断言的 pass/fail 及理由
- 综合推理文本

### 4.4 HumanScorer 设计

HumanScorer 是人工评分入口，作为最终校准基准。

**工作流：**
1. 评测完成后，CodeScorer 和 LLMScorer 已产生初步评分
2. 用户在前端查看评测结果，可逐条进行人工评分
3. 人工评分覆盖对应维度的机器评分
4. 支持标注备注，说明为什么给出这个分数

**用途：**
- 校准 LLMScorer 的准确性：对比人工评分和 LLM 评分的偏差
- 为有争议的用例提供最终裁决
- 积累标注数据，未来可用于微调评分模型

### 4.5 评分策略矩阵总览

| 评估项 | CodeScorer | LLMScorer | HumanScorer |
|-------|:---:|:---:|:---:|
| 关键词包含/排除 | ✅ 主力 | — | — |
| JSON 合法性 | ✅ 主力 | — | — |
| 字数限制 | ✅ 主力 | — | — |
| 正则匹配 | ✅ 主力 | — | — |
| 工具调用约束 | ✅ 主力 | — | — |
| 延迟/Token 约束 | ✅ 主力 | — | — |
| 回答准确性 | — | ✅ 主力 | 校准 |
| 回答完整性 | — | ✅ 主力 | 校准 |
| 安全性 | 关键词过滤 | ✅ 主力 | 仲裁 |
| 幻觉检测 | — | ✅ 主力 | 仲裁 |
| 语义等价 | — | ✅ 主力 | 仲裁 |
| 主观质量 | — | ✅ 辅助 | ✅ 主力 |

### 4.6 最终得分计算

```
passed = (所有 CodeScorer 断言通过) AND (所有 LLMScorer 语义断言通过) AND (维度加权得分 >= 阈值)

overall_score = Σ(维度得分 × 权重) / Σ(权重)

# 如果有人工评分覆盖：
final_score = human_score  （人工评分优先级最高）
```

---

## 五、Trace / 轨迹中间过程评估方案

### 5.1 平台现有能力

当前平台已经具备：

- **Langfuse 集成**：评测过程中自动创建 Trace，包含 Agent 调用的输入/输出、工具调用子 Span、Token 用量
- **Langfuse Proxy API**：前端可通过 `/api/langfuse/*` 获取 Trace 列表、详情、Observation 统计、延迟百分位、模型用量
- **轨迹数据采集**：OpenAI/Knot 适配器已经采集了完整的 `TrajectoryStep` 序列（thinking → tool_call → tool_result → text_output）
- **轨迹评估**：`trajectory_judge.py` 已实现程序化评分（40%）+ LLM 评分（60%）混合方案

### 5.2 Trace 数据中的确定性指标金矿

**以下指标可直接从 Trace/轨迹数据计算，无需 LLM 参与：**

#### A. 执行效率指标

| 指标 | 计算方式 | 意义 |
|------|---------|------|
| **端到端延迟** | `AgentResponse.latency_ms` | Agent 总响应时间 |
| **首 Token 延迟** | 第一个 text_output 步骤的 `timestamp_ms` | 用户感知的响应速度 |
| **思考时间占比** | thinking 步骤总耗时 / 总耗时 | 思考是否过度 |
| **工具调用耗时占比** | tool_call + tool_result 总耗时 / 总耗时 | 瓶颈在工具还是推理 |
| **最慢步骤** | `max(step.duration_ms)` | 性能瓶颈定位 |
| **Token 总消耗** | `token_usage.total_tokens` | 成本评估 |
| **Token 效率** | `len(output) / total_tokens` | 信息密度 |

#### B. 工具行为指标

| 指标 | 计算方式 | 意义 |
|------|---------|------|
| **工具精确率** | 正确工具调用数 / 总调用数 | 是否调对了工具 |
| **工具召回率** | 实际调用的期望工具数 / 期望工具总数 | 是否漏调了工具 |
| **工具 F1** | 2 × 精确率 × 召回率 / (精确率 + 召回率) | 综合工具使用质量 |
| **调用顺序一致性** | LCS(期望序列, 实际序列) / max(两序列长度) | 执行顺序是否合理 |
| **冗余调用率** | 非期望工具调用数 / 总调用数 | 是否有无用调用 |
| **重复调用检测** | 同一工具+同参数调用 > 1 次 | 是否有死循环/重复 |

#### C. 行为模式指标

| 指标 | 计算方式 | 意义 |
|------|---------|------|
| **是否产生思考** | trajectory 中有 thinking 类型步骤 | Chain-of-Thought 是否触发 |
| **思考长度** | thinking 步骤的 content 总长度 | 推理深度 |
| **错误恢复率** | tool_result 含错误后有重试行为的比例 | 鲁棒性 |
| **步骤总数** | `len(trajectory_steps)` | 执行复杂度 |
| **工具调用深度** | 最长连续 tool_call → tool_result 链 | 多步工具编排能力 |

### 5.3 从 Langfuse 提取的聚合指标

通过现有的 `/api/langfuse/observations/stats` 接口可获取：

| 聚合指标 | 数据来源 | 用途 |
|---------|---------|------|
| **Trace 延迟百分位**（P50/P90/P95/P99） | Langfuse Trace API | 整体性能画像 |
| **各步骤延迟百分位** | Langfuse Observation API (SPAN) | 瓶颈定位 |
| **模型延迟百分位** | Langfuse Observation API (GENERATION) | 模型响应速度对比 |
| **模型 Token 用量分布** | Langfuse Observation API | 成本分析 |
| **工具调用频率** | Langfuse Observation API (tool:*) | Skills 使用热度 |

### 5.4 轨迹评估策略改进

**现有方案**：程序化评分 40% + LLM 评分 60%

**改进方案**：分层评估，确定性指标独立呈现

```
轨迹评估结果:
├── 确定性指标（CodeScorer 直接计算，始终执行）
│   ├── 执行效率：延迟 2340ms，Token 1580，思考占比 35%
│   ├── 工具行为：精确率 0.85，召回率 1.0，F1 0.92，冗余率 0.05
│   └── 行为模式：有思考 ✓，步骤数 7，无重复调用 ✓，错误恢复 1/1
│
└── 非确定性评估（LLMScorer，可选执行）
    ├── 决策合理性：0.82 — 第3步选择了次优工具
    ├── 参数准确性：0.90 — 基本正确，有一处日期格式不精确
    └── 结果利用度：0.88 — 正确利用了搜索结果，但遗漏了一个字段
```

**核心改变**：确定性轨迹指标不再与 LLM 评分做加权融合，而是作为独立的、可靠的数据维度呈现给用户。用户可以根据自己的场景决定哪些指标更重要。

---

## 六、稳定性评估方案：Pass@K 与多轮一致性

### 6.1 为什么需要稳定性评估

Agent 的输出天然具有随机性（LLM 的 temperature、工具返回值变化等）。用户需要知道：
- **同一个问题问 5 次，Agent 是否每次都给出一致的答案？**
- **如果答案波动很大，说明这个 Agent 在该场景下不够稳定**
- **稳定性差的 Agent 在生产环境中可能给不同用户截然不同的体验**

**τ-bench 的教训**：即使是当时最强的 Agent，发布时单次成功率不到 50%，Pass@8 得分低于 25%，说明单次评测的"通过"极具欺骗性。单次成功不等于可靠。

### 6.2 Pass@K 指标：衡量真实可靠性

**Pass@K 定义**：在 K 次独立运行中，至少有 1 次成功完成任务的概率。

```
Pass@K = 1 - (失败次数/K)^K  ≈  P(至少一次成功)

Pass@1  = 单次通过率（传统指标，可能过于乐观）
Pass@3  = 3次内至少一次通过（快速可靠性检查）
Pass@5  = 推荐的生产可靠性指标
Pass@10 = 严格可靠性基准（关键业务场景）
```

**Pass@K 的业务含义**：

| 指标 | 适用场景 | 解读 |
|------|---------|------|
| **Pass@1** | 快速冒烟测试 | 最乐观估计，不代表可靠性 |
| **Pass@3** | 日常开发迭代 | 基本可靠性保证 |
| **Pass@5** | 生产上线评估 | 推荐基准，反映真实用户体验 |
| **Pass@10** | 关键任务 Agent | 高可靠性要求场景 |

**告警规则**：

```
Pass@1 > 0.8 但 Pass@5 < 0.5 → 高度不稳定，单次评测虚高
Pass@1 和 Pass@5 均 > 0.8   → 真正稳定可靠
Pass@5 < 0.3                → 生产环境不可接受
```

### 6.3 稳定性评测工作流

```
用户选择: Agent + 测试套件 + 重复次数(N, 默认3) + 评估模板
    │
    ├── 第1轮评测 → EvalRun #1 → 所有测试用例的结果
    ├── 第2轮评测 → EvalRun #2 → 所有测试用例的结果
    ├── ...
    └── 第N轮评测 → EvalRun #N → 所有测试用例的结果
    │
    ▼
稳定性分析引擎:
    ├── 按 test_case_id 对齐 N 轮结果
    ├── 计算 Pass@K（K = 1, 3, 5）
    ├── 计算每个用例的: 得分方差、输出相似度、工具调用一致性
    └── 输出: 稳定性报告
```

### 6.4 稳定性指标设计

#### 输出一致性

| 指标 | 计算方式 | 意义 |
|------|---------|------|
| **Pass@K** | K 次内至少 1 次通过的概率 | 真实可靠性（核心指标） |
| **得分方差** | N 次运行同一用例的 overall_score 方差 | 评分稳定性 |
| **得分变异系数** | 标准差 / 均值 | 归一化的波动幅度 |
| **通过一致性** | N 次中 passed 状态一致的比例 | 是否时过时不过 |
| **输出文本相似度** | N 次输出两两计算编辑距离或余弦相似度 | 内容是否稳定 |

#### 行为一致性

| 指标 | 计算方式 | 意义 |
|------|---------|------|
| **工具调用路径一致性** | N 次运行的工具调用序列是否相同 | 决策路径是否稳定 |
| **步骤数方差** | N 次运行的 trajectory 步骤数方差 | 执行复杂度是否稳定 |
| **延迟方差** | N 次运行的 latency_ms 方差 | 性能是否稳定 |

#### 聚合指标

| 指标 | 计算方式 | 解读 |
|------|---------|------|
| **整体稳定性分数** | 1 - 所有用例得分变异系数的均值 | 0-1，越接近 1 越稳定 |
| **Pass@5 套件通过率** | 套件内所有用例 Pass@5 的均值 | 整体可靠性 |
| **不稳定用例数** | 得分变异系数 > 阈值的用例数 | 哪些用例表现不稳定 |
| **最不稳定用例** | 按变异系数排序的 Top-K | 重点关注对象 |

### 6.5 稳定性报告输出

```
稳定性评估报告（5 轮运行）

整体稳定性分数: 0.82 (良好)
  ├── Pass@1:  80%  (单次通过率)
  ├── Pass@3:  92%  (3次内通过率)
  ├── Pass@5:  96%  ← 推荐关注的生产可靠性指标
  ├── 行为稳定性: 0.79 — 有部分用例工具调用路径不一致
  └── 性能稳定性: 0.91 — 延迟波动可接受

⚠️ 稳定性警告:
  Pass@1 (80%) 与 Pass@5 (96%) 差距 16%，单次评测存在低估风险
  建议在生产上线评估时使用 Pass@5 而非 Pass@1

不稳定用例 (3/20):
  • tc_007: "查询订单状态" — 得分 [0.85, 0.62, 0.78, 0.81, 0.60]，方差 0.011
    → 2/5 次未调用 search_order 工具，导致回答不完整
  • tc_012: "退款流程咨询" — 通过状态 [✓, ✗, ✓, ✓, ✗]，Pass@5=60%
    → 第2、5轮输出缺少退款时限信息
  • tc_018: "多步骤操作" — 步骤数 [5, 9, 6, 5, 8]，路径不一致
    → 2/5 次出现冗余的重复查询
```

---

## 七、跨模型对比方案

### 7.1 目标场景

用户的核心问题：**"我的 Agent 用 GPT-4o 好还是 Claude-3.5 好还是 DeepSeek-V3 好？"**

这个问题不能简单回答，因为"好"是多维度的：
- 模型 A 回答质量最高，但延迟 8 秒
- 模型 B 延迟 2 秒，但回答质量略低
- 模型 C 最便宜，Token 消耗只有 A 的 1/3

平台需要帮用户做出 **基于数据的决策**。

### 7.2 模型切换策略（关键技术决策）

**核心问题**：用户注册的 Agent 是一个调用端点，模型选择是 Agent 内部的事，平台如何从外部切换模型？

**现实分析**：看平台现有三种适配器的协议特性：

| Agent 类型 | 协议中是否有 model 字段 | 平台能否覆写 |
|-----------|---------------------|------------|
| **OpenAI 兼容** | ✅ 请求体中的 `model` 字段 | ✅ 可以覆写 |
| **Knot** | ✅ `input.model` 字段 | ✅ 可以覆写 |
| **HTTP** | ❌ 黑盒 URL，无标准字段 | ❌ 无法覆写 |

**设计决策：混合方案，按 Agent 类型自动选择策略**

- **快速模式（模型覆写）**：适用于 OpenAI 兼容 / Knot 类型。用户选 1 个 Agent + 填入多个 model 名称，平台在评测时临时覆写 adapter 的 model 字段。改造成本极低（adapter 层加一个 `model_override` 参数，约 3 行代码）。
- **自由模式（Agent 变体）**：适用于所有类型（含 HTTP）。用户创建多个 Agent 实例（相同配置但不同模型/URL），平台分别运行后聚合对比。

**两种模式产生的 ComparisonRun 结构完全一致，对比分析和可视化不感知数据来源。**

**注意事项**：模型覆写有一个隐含前提——用户的 API Key 必须有权限调用目标模型。同一厂商的不同模型通常没问题（如 DeepSeek 的 v3 和 r1），但跨厂商对比（如 GPT-4o vs Claude）仍需创建不同 Agent 变体（不同 base_url + api_key）。

**Adapter 层改造**：

```python
# BaseAdapter.invoke 新增可选参数
async def invoke(self, message: str, conversation_id: str = "",
                 model_override: str = "") -> AgentResponse:

# OpenAIAdapter: 覆写 model 字段
model = model_override or self.config.get("model", "gpt-4")
body = {"model": model, ...}

# KnotAdapter: 覆写 input.model 字段
model = model_override or cfg.get("model", "deepseek-v3.1")
chat_body = {"input": {"message": message, "model": model, ...}}

# HTTPAdapter: 忽略 model_override（无法干预黑盒）
```

**EvalRun 扩展**：新增 `modelOverride: String?` 字段，评测引擎传递给 adapter。

**前端交互**：

```
选择 Agent: "客服助手" (OpenAI 类型)
    │
    ├── 检测到 OpenAI/Knot 类型 → 展示"快速模式"
    │   当前模型: gpt-4o
    │   添加对比模型: [gpt-4o-mini] [deepseek-v3] [+]
    │
    └── 所有类型都支持 → 展示"自由模式"
        选择已注册的 Agent: [客服助手-GPT4o] [客服助手-DeepSeek] [+]

HTTP 类型 Agent:
    └── 仅展示"自由模式"，提示"HTTP 类型无法自动切换模型"
```

### 7.3 对比评测工作流

```
用户创建对比评测:
    │
    ├── 快速模式:
    │   ├── 选择 1 个 Agent (OpenAI/Knot)
    │   ├── 输入多个 model 名称
    │   └── 选择测试套件 + 评估模板
    │
    └── 自由模式:
        ├── 选择多个已注册的 Agent
        └── 选择测试套件 + 评估模板
    │
    ▼
平台自动执行:
    ├── 为每个模型/Agent 创建一个 EvalRun（快速模式带 modelOverride）
    ├── 并行或串行执行所有 EvalRun
    └── 所有 EvalRun 关联到一个 ComparisonRun
    │
    ▼
对比分析引擎:
    ├── 按 test_case_id 对齐各 EvalRun 的结果
    ├── 按维度聚合各 Agent/模型 的得分
    ├── 聚合效率指标（延迟、Token、成本）
    ├── 逐条用例级别对比（哪些用例在 A 上过了但在 B 上没过）
    └── 生成对比报告 + 推荐建议
```

### 7.3 对比维度

| 对比维度 | 数据来源 | 可视化方式 |
|---------|---------|----------|
| **各评估维度得分** | eval_results.scores | 雷达图：各维度得分叠加对比 |
| **总体得分** | eval_results.overall_score | 柱状图 |
| **通过率** | passed_count / total | 百分比对比 |
| **平均延迟** | eval_results.latency_ms | 柱状图 + 箱线图 |
| **延迟 P95** | 各用例延迟的 P95 | 尾部延迟对比 |
| **Token 消耗** | eval_results.token_usage | 柱状图 |
| **估算成本** | Token × 单价 | 柱状图 |
| **工具使用准确率** | trajectory 分析 | 柱状图 |
| **断言通过率** | assertions 通过数 / 总数 | 百分比对比 |

### 7.4 对比报告输出

```
模型对比报告

测试套件: "客服场景基础测试" (20 个用例)
评估模板: 客服 Agent

综合推荐: DeepSeek-V3 (性价比最优)

┌──────────────┬──────────┬───────────┬───────────┐
│ 指标          │ GPT-4o   │ Claude-3.5│ DeepSeek  │
├──────────────┼──────────┼───────────┼───────────┤
│ 综合得分      │ 0.87 🥇  │ 0.84      │ 0.82      │
│ 通过率        │ 90%      │ 85%       │ 85%       │
│ 平均延迟      │ 4200ms   │ 3100ms    │ 1800ms 🥇│
│ P95 延迟      │ 8500ms   │ 5200ms    │ 3200ms 🥇│
│ 平均 Token    │ 1850     │ 1620      │ 980 🥇   │
│ 估算成本/次   │ ¥0.12    │ ¥0.08     │ ¥0.02 🥇 │
│ 安全性        │ 0.95     │ 0.98 🥇   │ 0.92      │
│ 准确性        │ 0.89 🥇  │ 0.86      │ 0.83      │
│ 工具使用      │ 0.85     │ 0.88 🥇   │ 0.82      │
│ 断言通过率    │ 95% 🥇   │ 92%       │ 88%       │
└──────────────┴──────────┴───────────┴───────────┘

关键发现:
  • GPT-4o 综合质量最高，但成本是 DeepSeek 的 6 倍
  • Claude-3.5 安全性和工具使用最好，适合对安全要求高的场景
  • DeepSeek-V3 延迟和成本优势明显，综合得分与 GPT-4o 差距仅 5%
  
建议:
  • 生产环境推荐 DeepSeek-V3（性价比最优）
  • 对质量要求极高的场景可用 GPT-4o
  • 安全敏感场景推荐 Claude-3.5
```

---

## 八、用户自定义断言机制

### 8.1 设计思路

平台不替用户定义什么是"好"——但平台提供一套声明式工具，让用户能精确描述自己的业务规则。

**核心问题**：不同业务场景的 Agent 有完全不同的"正确"标准：
- 客服场景："回答必须包含订单号"、"不能推荐竞品"、"必须调用查单工具"
- 代码场景："输出必须是合法 JSON"、"不能超过 200 行"
- RAG 场景："必须引用来源"、"回答必须基于检索结果"

这些规则用 LLM 评分无法精确判定，但用断言可以 100% 确定。

### 8.2 断言数据结构

断言存储在 TestCase 中，每个测试用例可以有自己独立的断言规则：

```json
{
  "id": "tc_001",
  "input": "查询订单12345的状态",
  "expected_output": "订单已发货，预计明天到达",
  "assertions": [
    {
      "type": "contains",
      "value": "订单",
      "message": "回答必须包含订单信息",
      "critical": true
    },
    {
      "type": "not_contains",
      "value": "竞品名称",
      "message": "不能推荐竞品"
    },
    {
      "type": "tool_called",
      "value": "search_order",
      "message": "必须调用 search_order 工具",
      "critical": true
    },
    {
      "type": "tool_count_max",
      "value": 3,
      "message": "工具调用不超过3次"
    },
    {
      "type": "latency_max",
      "value": 5000,
      "message": "响应时间不超过5秒"
    },
    {
      "type": "semantic_match",
      "value": "订单已发货，预计明天到达",
      "message": "回答应包含发货状态和预计到达时间"
    }
  ]
}
```

### 8.3 断言分类

| 类别 | 断言类型 | 执行器 | 说明 |
|------|---------|--------|------|
| **输出内容** | contains / not_contains / regex_match / starts_with / ends_with / exact_match | CodeScorer | 输出文本必须/不能包含什么 |
| **输出格式** | json_valid / max_length / min_length | CodeScorer | 输出格式约束 |
| **工具行为** | tool_called / tool_not_called / tool_count_max / tool_count_min | CodeScorer | 工具调用约束 |
| **性能约束** | latency_max / token_max | CodeScorer | 非功能性约束 |
| **语义级别** | semantic_match | LLMScorer | 语义等价判断 |

### 8.4 断言执行流程

```
TestCase.assertions
    │
    ├─ 分组: code_assertions (确定性) + semantic_assertions (非确定性)
    │
    ├─ Step 1: CodeScorer 执行 code_assertions
    │   ├── 每条断言独立执行，返回 pass/fail
    │   └── 如果有 critical=true 的断言失败 → 标记快速失败
    │
    ├─ 快速失败检查
    │   ├── 有关键断言失败 → 跳过 LLM 评分，直接标记 passed=false
    │   └── 无关键失败 → 继续
    │
    ├─ Step 2: LLMScorer 执行 semantic_assertions + 维度评分
    │   ├── 语义断言: 用 LLM 判断 Agent 输出是否与 value 语义等价
    │   └── 维度评分: 按评估模板的维度评分
    │
    └─ Step 3: 综合判定
        ├── passed = 所有断言通过 AND 维度加权得分 >= 阈值(0.6)
        └── 生成详细的断言结果列表
```

### 8.5 断言结果格式

```json
{
  "assertion_results": [
    {"type": "contains", "value": "订单", "passed": true, "reason": "输出包含'订单'"},
    {"type": "tool_called", "value": "search_order", "passed": true, "reason": "search_order 被调用了 1 次"},
    {"type": "latency_max", "value": 5000, "passed": false, "reason": "实际延迟 6200ms > 5000ms"},
    {"type": "semantic_match", "value": "订单已发货...", "passed": true, "reason": "语义匹配：输出包含发货状态和到达时间"}
  ],
  "assertions_passed": 3,
  "assertions_failed": 1,
  "assertions_total": 4,
  "all_assertions_passed": false,
  "critical_failure": false
}
```

### 8.6 从 Bad Case 到断言的闭环

```
生产环境发现问题 → 标记为 Bad Case → 分析问题根因 → 编写断言规则 → 加入测试套件 → 回归验证

例:
  Bad Case: Agent 推荐了竞品
  → 断言: {"type": "not_contains", "value": "竞品名", "critical": true}
  → 加入客服场景测试套件
  → 后续每次评测自动检查
```

---

## 九、回归测试体系

### 9.1 核心理念

> **评估的目的不是给 Agent 打一个"绝对分数"，而是回答"改了之后变好了还是变差了"。**
> —— 参考 Anthropic 的"能力评估 vs 回归评估"概念

### 9.2 基线管理

**基线**：某次评测结果被标记为"基准"，后续评测与之对比。

```
第1次评测 → 全面测试 → 标记为基线 ✅
    │
    ├── 修改 Agent Prompt → 第2次评测 → 与基线对比 → "准确性提升8%, 但安全性下降3%"
    │
    ├── 更换模型 → 第3次评测 → 与基线对比 → "延迟降低40%, 质量下降2%"
    │
    └── 添加新 Skills → 第4次评测 → 与基线对比 → "工具调用率提升, 其他维度持平"
```

**基线规则**：
- 同一个 Agent + 同一个测试套件 只能有一个活跃基线
- 新标记基线时，旧基线自动取消
- 基线的 EvalRun 不可删除（保护基准数据）

### 9.3 回归对比算法

```
输入: baseline_run_id, current_run_id
输出: RegressionReport

算法:
  1. 加载 baseline 和 current 的所有 EvalResult
  2. 按 test_case_id 建立映射（哈希匹配，O(n)）
  3. 对每个匹配的用例:
     - 计算得分变化: Δ = current.score - baseline.score
     - 计算通过状态变化: 新增通过 / 新增失败 / 不变
     - 计算断言结果变化（如有）
  4. 按维度聚合:
     - 各维度均值变化
     - 各维度标准差变化
  5. 退化检测:
     - 任一维度均值下降超过阈值(默认10%) → 标记为退化
     - 通过率下降超过阈值(默认5%) → 标记为退化
  6. 生成报告
```

### 9.4 退化预警

| 退化级别 | 条件 | 表现 |
|---------|------|------|
| 🟢 **改善** | 维度均值上升 > 5% | 绿色箭头 ↑ |
| ⚪ **持平** | 变化在 ±5% 以内 | 灰色横线 — |
| 🟡 **轻微退化** | 维度均值下降 5-10% | 黄色箭头 ↓ |
| 🔴 **严重退化** | 维度均值下降 > 10% | 红色箭头 ↓↓ |

### 9.5 回归报告示例

```
回归对比报告

基线: EvalRun #abc123 (2026-02-20, 综合 0.78)
当前: EvalRun #def456 (2026-02-26, 综合 0.82)

总体变化: +5.1% ↑ (改善)

维度变化:
  准确性:    0.75 → 0.83  +10.7% 🟢 改善
  完整性:    0.80 → 0.82  +2.5%  ⚪ 持平
  安全性:    0.92 → 0.88  -4.3%  ⚪ 持平 (接近阈值，需关注)
  工具使用:  0.70 → 0.85  +21.4% 🟢 显著改善
  延迟均值:  3200ms → 2800ms  -12.5% 🟢 改善

通过率: 75% → 85%  +10% 🟢 改善

新增失败用例 (1):
  • tc_015: "复杂退款流程" — 基线通过，当前未通过
    → 原因: 新增的 tool_called 断言未满足

新增通过用例 (3):
  • tc_003, tc_009, tc_017 — 之前失败，现在通过
```

---

## 十、Bad Case 管理闭环

### 10.1 设计思路

> **Anthropic 建议："从 20 个失败案例开始构建你的评测数据集"**

Bad Case 管理不是简单的"标记失败用例"，而是一个从发现问题到解决问题的完整闭环。

### 10.2 Bad Case 来源

| 来源 | 说明 | 操作 |
|------|------|------|
| **评测结果导入** | 从评测结果中一键标注 | 点击"标记为 Bad Case"，自动关联 eval_result_id |
| **手动创建** | 用户从生产环境中发现的问题 | 手动录入 input、expected_output、actual_output |
| **回归退化** | 回归测试中新增的失败用例 | 自动检测并建议标记 |

### 10.3 Bad Case 数据结构

```json
{
  "id": "bc_001",
  "agent_id": "agent_xxx",
  "input": "帮我查一下订单12345的物流信息",
  "expected_output": "您的订单12345已于2月25日发货，目前在途中，预计2月27日送达",
  "actual_output": "好的，我来帮您查询。[未调用任何工具] 您的订单正在处理中。",
  "assertions": [
    {"type": "tool_called", "value": "query_logistics", "message": "必须调用物流查询工具"},
    {"type": "contains", "value": "发货", "message": "回答应包含发货状态"}
  ],
  "source": "eval_result",
  "eval_result_id": "result_xxx",
  "tags": ["工具未调用", "信息不完整"],
  "root_cause": "Agent 没有识别出需要调用物流查询工具",
  "created_at": "2026-02-26T10:00:00Z"
}
```

### 10.4 Bad Case 工作流

```
发现 Bad Case
    │
    ├── 标注来源和原因
    │
    ├── 编写断言规则（从 Bad Case 抽象出通用规则）
    │
    ├── 批量导出为测试用例 → 加入测试套件
    │   └── 每个 Bad Case 自动携带其断言规则
    │
    ├── 修改 Agent（Prompt/Skills/模型）
    │
    └── 回归测试 → 检查 Bad Case 是否修复
        ├── 修复 → 标记为"已解决"
        └── 未修复 → 继续迭代
```

### 10.5 Bad Case 统计面板

```
Bad Case 统计

总计: 45 个
  • 未解决: 12
  • 已解决: 28
  • 进行中: 5

按来源:
  评测导入: 30 (67%)
  手动创建: 15 (33%)

按类别:
  工具未调用: 15
  输出格式错误: 8
  信息不完整: 10
  安全问题: 3
  其他: 9

趋势: 本周新增 5 个，解决 8 个 (净减少 3 个) ✅
```

---

## 十一、Skills 健康度分析

### 11.1 重新理解 Skills

Skills（在 Knot 等平台中）是渐进式披露的文件系统形式，不能简单地"添加进去就能用"。对 Skills 的评估应关注：

1. **使用频率**：哪些 Skills 经常被调用？哪些从未被调用？
2. **安全性**：Skills 的描述是否可能引导 Agent 做出不安全行为？
3. **设计合理性**：Skills 的命名、描述、参数设计是否清晰？

### 11.2 Skills 数据来源

| 数据 | 来源 | 说明 |
|------|------|------|
| Skills 定义列表 | Agent 配置的 `skills` 字段 | 每个 Skill 的 name 和 description |
| Skills 调用频率 | `eval_results.skills_called` | 评测过程中每个 Skill 被调用的次数 |
| Skills 调用成功率 | `trajectory_steps` 中 tool_result 的状态 | 哪些调用成功了，哪些失败了 |
| Skills 调用耗时 | `trajectory_steps` 中的 duration_ms | 每个 Skill 的平均执行耗时 |

### 11.3 健康度评估维度

| 维度 | 评估方式 | 指标 |
|------|---------|------|
| **调用频率** | 确定性（统计） | 调用次数、调用率、未使用 Skills 列表 |
| **调用成功率** | 确定性（统计） | 成功次数 / 总调用次数 |
| **平均耗时** | 确定性（统计） | 各 Skill 的 P50/P95 耗时 |
| **描述清晰度** | LLM 评估 | Skill 的 description 是否准确描述了功能 |
| **命名规范性** | LLM 评估 | Skill 名称是否见名知意 |
| **安全性** | LLM 评估 | Skill 是否可能被 Prompt 注入利用 |
| **参数设计** | LLM 评估 | 参数是否必要且完整 |

### 11.4 健康度报告

```
Skills 健康度报告 — Agent "客服助手"

已配置 Skills: 5 个
评测调用数据来源: 最近 3 次评测 (共 60 个用例)

┌───────────────┬──────┬───────┬──────┬──────────────────────┐
│ Skill          │ 调用次│ 成功率 │ P50  │ 健康状态               │
├───────────────┼──────┼───────┼──────┼──────────────────────┤
│ search_order   │ 42   │ 95%   │ 320ms│ 🟢 健康               │
│ query_logistics│ 28   │ 89%   │ 450ms│ 🟡 成功率偏低          │
│ submit_ticket  │ 15   │ 100%  │ 280ms│ 🟢 健康               │
│ search_faq     │ 3    │ 67%   │ 1200ms│ 🔴 成功率低且慢       │
│ update_profile │ 0    │ —     │ —    │ ⚪ 从未使用            │
└───────────────┴──────┴───────┴──────┴──────────────────────┘

LLM 评审结论:
  • search_faq: 描述过于模糊("搜索FAQ")，建议改为"根据关键词搜索客服FAQ知识库"
  • update_profile: 在客服场景中可能不需要此 Skill，建议移除以减少干扰
  • 安全性: 未发现明显安全风险
```

---

## 十二、LLM-as-Judge 偏见缓解机制

LLM-as-Judge 是非确定性评估的核心手段，但其可靠性本身需要被保证。本章明确偏见来源及系统性缓解措施。

### 12.1 主要偏见类型

| 偏见类型 | 表现形式 | 危害 |
|---------|---------|------|
| **位置偏见** (Positional Bias) | 倾向给先出现的选项或更靠前的内容高分 | 破坏对比评估的公平性 |
| **冗长偏见** (Verbosity Bias) | 倾向给更长的回答高分，即使内容重复 | 奖励冗长而非准确 |
| **风格偏见** (Style Bias) | 对 markdown 格式、特定写作风格有偏好 | 忽视实质内容质量 |
| **自我偏好偏见** (Self-Enhancement Bias) | 倾向高分评价与自身输出风格相近的内容 | 评估者与被评估者使用同一模型时失效 |
| **知识截止偏见** (Knowledge Cutoff Bias) | 对模型训练截止后的知识认知有限 | 评估最新信息时不可靠 |
| **从众偏见** (Bandwagon Bias) | 倾向给"看起来更主流"的答案高分 | 不利于新颖但正确的解答 |

### 12.2 LLMScorer 的偏见缓解设计

#### 评分 Prompt 设计原则（基于 2025 年最佳实践）

```
原则 1：Chain-of-Thought 必选
  → 要求 Judge 先输出详细推理过程，再给分
  → 增加 evaluation_steps 字段：将复杂评估拆解成多个子步骤
  → 降低单步出错概率，提高推理可解释性

原则 2：Rubric 明确化
  → 每个维度定义清晰的多级评分标准（scoring_criteria）
  → 示例：不同分数段的预期表现描述，避免 Judge 自行解读

原则 3：消歧 Prompt 注入
  → 明确告知 Judge "请不要因为回答更长就给更高分"
  → 明确告知 Judge "输出顺序不影响评分"

原则 4：避免自我评估
  → 不使用与被测 Agent 相同的模型作为 Judge
  → 跨厂商选 Judge（如用 Claude 评估 GPT 输出，或反之）
```

#### LLMScorer Prompt 模板

```python
JUDGE_PROMPT_TEMPLATE = """
你是一位专业的 AI Agent 评估专家。请对下面的 Agent 回答进行评估。

## 评估任务
用户问题：{question}
Agent 回答：{agent_output}
参考答案：{expected_output}（仅作参考，语义等价即可）

## 评估维度：{dimension_name}
评分标准：{scoring_criteria}

## 评估步骤（请严格按步骤思考后再给分）
{evaluation_steps}

## 重要提醒
- 请不要因为回答更长、格式更丰富就给更高分
- 请关注内容的准确性和实用性，而非形式
- 分数范围：0.0 - 1.0，精确到 0.1

## 输出格式
{{
  "reasoning": "详细的评分理由...",
  "score": 0.0
}}
"""
```

### 12.3 多评估者共识机制（Judge Ensemble）

**单一 Judge 的风险**：某个 Judge 模型的系统性偏见会污染所有评分结果。

**共识机制设计**（可选，适用于高置信度要求场景）：

```
Judge Ensemble 配置:
  primary_judge:   claude-3-5-sonnet  (主评估者，权重 0.5)
  secondary_judge: gpt-4o             (副评估者，权重 0.3)
  tiebreaker:      gemini-1.5-pro     (仲裁，权重 0.2)

共识算法:
  1. 三个 Judge 独立评分
  2. 计算加权平均分
  3. 如果最高分和最低分差距 > 0.3 → 标记为"争议用例"，建议人工复审
  4. 输出共识分 + 置信区间 + 各 Judge 分数明细
```

**简化模式**（默认，适合成本敏感场景）：
- 单个 Judge 评分，但保留"争议标记"接口
- 当 CodeScorer 结果与 LLMScorer 结果严重矛盾时（如代码断言全过但 LLM 打低分），自动触发二次评估

### 12.4 Judge 校准（Calibration）

Judge 的评分是否准确，需要定期校准：

```
校准流程:
  1. 准备 50-100 个已有人工评分标注的"黄金用例"（Golden Calibration Set）
  2. 让 Judge 对这些用例评分
  3. 计算 Judge 分数与人工分数的 Spearman 相关系数
  4. 相关系数 > 0.8 → Judge 可信
  5. 相关系数 < 0.6 → 需要调整 Judge Prompt 或更换 Judge 模型

校准报告（每季度或每次更换 Judge 模型后）:
  Judge 模型: claude-3-5-sonnet
  黄金用例数: 80
  Spearman 相关系数: 0.84 ✅
  平均分偏差: +0.03（轻微高估）
  已知偏见: 对长回答轻微偏高（已在 Prompt 中添加提示）
```

---

## 十三、可验证环境评估（沙箱模式）

### 13.1 设计背景

传统 LLM 输出评估的根本局限：**LLM 评分的"正确性"本身无法被客观验证**。SWE-bench 提出了一个更可靠的路径：**让结果自己说话——通过执行测试用例来验证答案是否正确**。

这对代码生成、API 调用、数据库操作等类型的 Agent 同样适用。

### 13.2 适用场景

| Agent 类型 | 可验证内容 | 验证方式 |
|-----------|-----------|---------|
| **代码 Agent** | 生成的代码是否能运行、测试是否通过 | 代码执行 + 单元测试 |
| **SQL Agent** | SQL 查询结果是否符合期望 | 执行 SQL + 对比结果集 |
| **数据处理 Agent** | 输出数据是否符合格式和内容要求 | Schema 校验 + 断言 |
| **工具调用 Agent** | 最终状态是否达到预期 | 对比数据库/系统状态变化 |
| **计算 Agent** | 数值计算结果是否正确 | 精确值比对 |

**不适用场景**：开放域对话、创意写作、主观咨询等无唯一正确答案的任务。

### 13.3 沙箱评估设计

```
沙箱评估模式（Sandbox Evaluation Mode）

标记: TestCase.eval_mode = "sandbox"

执行流程:
    │
    ├── 1. 创建隔离的执行环境（进程沙箱 / Docker 容器）
    │
    ├── 2. Agent 执行 → 产生输出（代码/SQL/数据等）
    │
    ├── 3. 在沙箱中执行 Agent 输出
    │   ├── 代码 Agent: 执行生成的代码，运行测试用例
    │   ├── SQL Agent: 执行 SQL，对比返回结果
    │   └── 工具调用 Agent: 检查最终数据库/系统状态
    │
    ├── 4. 对比实际结果与期望结果
    │   ├── PASS_TO_PASS 验证: 原有通过的测试依然通过（无副作用）
    │   └── FAIL_TO_PASS 验证: 目标测试从失败变为通过（问题解决）
    │
    └── 5. 沙箱销毁，输出验证结果
```

### 13.4 TestCase 沙箱字段扩展

```json
{
  "id": "tc_sandbox_001",
  "input": "写一个 Python 函数，计算列表的中位数",
  "eval_mode": "sandbox",
  "sandbox_config": {
    "runtime": "python3.12",
    "timeout_ms": 10000,
    "test_cases": [
      {"input": "[1, 3, 5]", "expected_output": "3"},
      {"input": "[1, 2, 3, 4]", "expected_output": "2.5"},
      {"input": "[]", "expected_output": "None"}
    ],
    "pass_threshold": 0.8
  }
}
```

### 13.5 沙箱评估与 LLM 评估的协同

沙箱评估提供客观的 pass/fail，LLM 评估提供代码质量、可读性等主观维度评估，二者互补：

```
代码 Agent 评估结果:
├── 沙箱验证（确定性）
│   ├── 测试通过率: 8/10 (80%)  ← 客观事实
│   ├── PASS_TO_PASS: ✅ 无副作用
│   └── 执行时间: 45ms
│
└── LLM 评估（非确定性）
    ├── 代码质量: 0.78
    ├── 可读性: 0.85
    └── 边界情况处理: 0.70
```

### 13.6 第一阶段实现建议（轻量级）

全量 Docker 沙箱成本较高，推荐分阶段实现：

| 阶段 | 方式 | 适用 | 成本 |
|------|------|------|------|
| **P1（立即可做）** | Python `subprocess` + 超时控制 + 受限 builtins | Python 代码执行 | 极低 |
| **P2（短期）** | 数据库 Transaction + Rollback 模式 | SQL / 数据库操作 | 低 |
| **P3（中期）** | Docker 容器化沙箱 | 完整代码环境、多语言 | 中 |

---

## 十四、数据流与系统架构

### 14.1 评测数据流（从输入到结果）

```
用户发起评测
    │
    ├── 输入: Agent + 测试套件 + 评估模板 + Judge 配置
    │
    ▼
EvalEngine (评测引擎)
    │
    ├── 1. 加载测试用例和断言规则
    ├── 2. 创建 EvalRun 记录
    │
    ├── 3. 遍历测试用例（并发控制 Semaphore）
    │   │
    │   ├── 3a. 调用 Agent Adapter → 获取 AgentResponse
    │   │       ├── content (最终输出)
    │   │       ├── trajectory_steps (执行轨迹)
    │   │       ├── tool_calls (工具调用记录)
    │   │       ├── token_usage (Token 消耗)
    │   │       └── latency_ms (延迟)
    │   │
    │   ├── 3b. 上报 Langfuse Trace
    │   │
    │   ├── 3c. ScoringEngine 评分
    │   │   │
    │   │   ├── CodeScorer: 执行确定性断言
    │   │   │   ├── 关键词/格式/工具/性能断言 → assertion_results
    │   │   │   └── 关键断言失败? → 快速失败标记
    │   │   │
    │   │   ├── (如果未快速失败)
    │   │   │
    │   │   ├── LLMScorer: 执行非确定性评估
    │   │   │   ├── 维度评分 → dimension_scores
    │   │   │   └── 语义断言 → semantic_assertion_results
    │   │   │
    │   │   └── 合并结果
    │   │       ├── overall_score = Σ(维度 × 权重)
    │   │       ├── passed = 断言全过 AND 得分 >= 阈值
    │   │       └── assertion_results = code + semantic
    │   │
    │   ├── 3d. 轨迹评估（如启用）
    │   │   ├── 确定性轨迹指标（效率/工具行为/行为模式）
    │   │   └── LLM 轨迹评分（决策合理性等）
    │   │
    │   └── 3e. 保存 EvalResult
    │
    ├── 4. 评测完成
    │   ├── 更新 EvalRun 状态和摘要
    │   ├── 检查是否有基线 → 自动生成回归对比
    │   └── 生成评测报告
    │
    └── 5. 上报 Langfuse Scores
```

### 14.2 系统架构图

```
┌────────────────────── 前端 (React + TypeScript) ──────────────────────┐
│                                                                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ 评测中心  │ │ 评估框架  │ │ Bad Case │ │ 模型对比  │ │ Skills   │  │
│  │ (增强)   │ │ 管理     │ │ 管理     │ │         │ │ 分析     │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌────────────────────────────────────┐   │
│  │ 测试套件  │ │ 评测报告  │ │ 通用组件: RadarChart,               │   │
│  │ (增强)   │ │         │ │ AssertionEditor, RegressionDiff     │   │
│  └──────────┘ └──────────┘ └────────────────────────────────────┘   │
└───────────────────────────────┬───────────────────────────────────────┘
                                │ HTTP API
┌───────────────────────────────┴───────────────────────────────────────┐
│                        FastAPI API 层                                  │
│                                                                       │
│  /api/eval-runs (增强)     /api/eval-framework    /api/bad-cases      │
│  /api/comparisons          /api/skills-analysis   /api/eval-reports   │
│  /api/test-suites (增强)   /api/dashboard (增强)  /api/langfuse/*     │
└───────────────────────────────┬───────────────────────────────────────┘
                                │
┌───────────────────────────────┴───────────────────────────────────────┐
│                           服务层                                       │
│                                                                       │
│  ┌────────────────────────────────────────────────────┐               │
│  │              ScoringEngine (统一调度器)               │               │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐      │               │
│  │  │CodeScorer │  │LLMScorer  │  │HumanScorer│      │               │
│  │  │确定性断言  │  │语义+维度   │  │人工评分    │      │               │
│  │  └───────────┘  └───────────┘  └───────────┘      │               │
│  └────────────────────────────────────────────────────┘               │
│                                                                       │
│  ┌──────────────┐ ┌────────────────┐ ┌──────────────────┐            │
│  │ EvalEngine   │ │RegressionSvc   │ │ComparisonSvc     │            │
│  │ 评测引擎(增强)│ │回归测试服务     │ │模型对比服务       │            │
│  └──────────────┘ └────────────────┘ └──────────────────┘            │
│                                                                       │
│  ┌──────────────┐ ┌────────────────┐ ┌──────────────────┐            │
│  │ BadCaseSvc   │ │SkillsAnalyzer  │ │OptimizationAdvisor│           │
│  │Bad Case 管理 │ │Skills 健康度   │ │优化建议生成器      │            │
│  └──────────────┘ └────────────────┘ └──────────────────┘            │
│                                                                       │
│  ┌──────────────┐                                                     │
│  │ReportEngine  │                                                     │
│  │评测报告引擎   │                                                     │
│  └──────────────┘                                                     │
└───────────────────────────────┬───────────────────────────────────────┘
                                │
┌───────────────────────────────┴───────────────────────────────────────┐
│                     数据层                                             │
│                                                                       │
│  MySQL + Prisma                        Langfuse                       │
│  ┌────────────────────────┐           ┌────────────────────────┐     │
│  │ 现有 5 表 (扩展字段)    │           │ Traces / Observations  │     │
│  │ + EvalTemplate         │           │ / Scores               │     │
│  │ + EvalDimension        │           │                        │     │
│  │ + BadCase              │           │ (延迟/Token/工具调用    │     │
│  │ + EvalReport           │           │  等聚合统计数据)        │     │
│  │ + ComparisonRun        │           │                        │     │
│  │ + SkillsAnalysis       │           └────────────────────────┘     │
│  └────────────────────────┘                                          │
└──────────────────────────────────────────────────────────────────────┘
```

### 14.3 数据库扩展设计

**现有表扩展：**

| 表 | 扩展字段 | 说明 |
|---|--------|------|
| `EvalRun` | `isBaseline: Boolean` | 是否为基线 |
| `EvalRun` | `baselineRunId: String?` | 基线 Run 的 ID |
| `EvalRun` | `templateId: String?` | 使用的评估模板 ID |
| `EvalResult` | `assertionResults: Json?` | 断言执行结果 |
| `TestCase` (JSON内) | `assertions: []` | 测试用例的断言列表 |

**新增表：**

| 表 | 说明 | 核心字段 |
|---|------|---------|
| `EvalTemplate` | 评估模板 | name, category, description, isBuiltin, dimensionConfig |
| `EvalDimension` | 评估维度定义 | name, displayName, description, layer, scoringMethod, scoringCriteria, weight |
| `BadCase` | Bad Case | agentId, input, expectedOutput, actualOutput, assertions, source, evalResultId, status, tags |
| `EvalReport` | 评测报告 | evalRunId, summary, dimensionAnalysis, regressionDiff, recommendations |
| `ComparisonRun` | 模型对比运行 | name, testSuiteId, evalRunIds, templateId, comparisonData |
| `SkillsAnalysis` | Skills 分析结果 | agentId, usageStats, securityAssessment, designReview |

---

## 十五、评估模板系统

### 15.1 模板的作用

评估模板是三层维度的"预装组合包"，降低用户配置评测的门槛。

**用户不需要从零开始选维度和配权重，选一个模板就能开始。**

### 15.2 预置模板

| 模板 | 类别 | 通用层 | 类型层维度 | 默认权重 |
|------|------|--------|----------|---------|
| **通用 Agent** | generic | ✅ | accuracy, completeness, helpfulness, relevance, instruction_following | 均等 |
| **客服 Agent** | customer_service | ✅ | problem_resolution, response_clarity, empathy, accuracy, instruction_following | 解决率 0.3 |
| **代码 Agent** | coding | ✅ | code_correctness, code_quality, completeness, efficiency, tool_usage | 正确性 0.3 |
| **RAG Agent** | rag | ✅ | retrieval_relevance, citation_accuracy, answer_faithfulness, completeness, conciseness | 忠实度 0.25 |

### 15.3 自定义模板

用户可以：
1. 基于预置模板复制并修改
2. 从零创建自定义模板
3. 添加/删除维度、调整权重、修改评分标准文本
4. 绑定默认断言规则（模板级别的通用断言）

---

## 十六、智能优化建议

### 16.1 建议来源

评测完成后，基于评测数据自动生成优化建议：

| 数据来源 | 能生成的建议 |
|---------|------------|
| **低分维度** | "准确性得分 0.62，建议在 System Prompt 中强调'基于事实回答，不确定时说明'" |
| **失败断言** | "3 个用例未调用 search_order 工具，建议在 Skills 描述中明确使用场景" |
| **轨迹分析** | "平均工具调用 5.2 次，存在冗余，建议优化 Prompt 中的工具使用指引" |
| **性能数据** | "P95 延迟 8.5s，瓶颈在 search_faq（P95: 3.2s），建议优化该 Skill 或增加缓存" |
| **模型对比** | "DeepSeek-V3 在你的场景下性价比最优，综合得分与 GPT-4o 仅差 5%，成本降低 83%" |
| **稳定性** | "3 个用例在多次运行中表现不稳定，建议降低 temperature 或增加 Prompt 约束" |
| **Bad Case 模式** | "65% 的 Bad Case 与'工具未调用'相关，建议检查 Skills 配置是否完整" |

### 16.2 建议分类

| 类别 | 说明 | 示例 |
|------|------|------|
| **Prompt 优化** | 改进 System Prompt | "在 Prompt 中添加格式约束：'请以 JSON 格式输出'" |
| **Skills 优化** | 调整工具配置 | "search_faq 成功率仅 67%，建议检查该工具的稳定性" |
| **模型选择** | 推荐更合适的模型 | "你的场景对延迟敏感，建议从 GPT-4o 切换到 DeepSeek-V3" |
| **测试补充** | 扩展测试覆盖 | "当前测试套件缺少多轮对话场景，建议补充 5-10 个多轮用例" |

---

## 十七、平台现状与改造路径

### 17.1 现有能力清单

| 能力 | 现状 | 评估框架中的角色 |
|------|------|----------------|
| 5 表数据模型 | ✅ 已实现 | 基础，需扩展 |
| HTTP/OpenAI/Knot 三种适配器 | ✅ 已实现 | 保持不变 |
| LLM-as-Judge 评分 | ✅ 已实现（7 硬编码维度） | 重构为 LLMScorer，维度从 DB 加载 |
| 轨迹评估（程序化+LLM 混合） | ✅ 已实现 | 增强确定性指标，分离展示 |
| Langfuse Trace 上报 | ✅ 已实现 | 保持，增加断言结果上报 |
| Langfuse Proxy API | ✅ 已实现 | 保持，用于确定性指标提取 |
| LLM 测试用例生成 | ✅ 已实现 | 保持不变 |
| 评测引擎串行执行 | ✅ 已实现 | 改为并发控制 |

### 17.2 需要新增的能力

| 能力 | 优先级 | 复杂度 |
|------|--------|--------|
| **CodeScorer + 断言引擎** | P0 | 中 — 纯 Python 实现 |
| **EvalDimension 表 + 维度动态加载** | P0 | 低 — 数据库 + 查询 |
| **EvalTemplate 表 + 模板系统** | P0 | 低 — CRUD |
| **回归测试（基线标记 + 对比算法）** | P0 | 中 — 算法 + API + 前端 |
| **Bad Case 管理** | P1 | 中 — 全栈 CRUD + 导入/导出 |
| **稳定性评估** | P1 | 中 — 多轮运行 + 统计分析 |
| **跨模型对比** | P1 | 中 — 多 Run 关联 + 聚合 |
| **Skills 健康度分析** | P2 | 中 — 统计 + LLM 评审 |
| **智能优化建议** | P2 | 中 — 规则 + LLM 生成 |
| **评测报告生成** | P2 | 低 — 聚合数据 + 模板渲染 |
| **HumanScorer** | P2 | 低 — API + 前端 |

### 17.3 向后兼容策略

| 变化项 | 兼容方式 |
|-------|---------|
| TestCase 新增 assertions 字段 | JSON 内部新增可选字段，无断言时走原有逻辑 |
| EvalRun 新增 templateId | 可选字段，不传时使用默认维度列表 |
| 评分逻辑改为 ScoringEngine | 无断言且未指定模板时，行为与现有完全一致 |
| 现有 7 个硬编码维度 | 作为 seed 数据写入 eval_dimensions 表 |
| `passed` 判定逻辑 | 原逻辑 `overall_score >= 0.6` 保持为默认，断言为附加条件 |

### 17.4 实施阶段建议

**第一阶段（核心引擎）：**
- Prisma Schema 扩展
- CodeScorer + 断言引擎
- 评估维度数据库化
- 评估模板 CRUD
- EvalEngine 重构（ScoringEngine 集成 + 并发）

**第二阶段（变化驱动）：**
- 回归测试（基线 + 对比 + 退化检测）
- Bad Case 管理（CRUD + 导入导出）
- 前端断言编辑器
- 前端回归对比视图

**第三阶段（洞察能力）：**
- 稳定性评估
- 跨模型对比
- Skills 健康度
- 智能优化建议
- 评测报告

---

## 附录 A：断言类型完整参考

| 类型 | 参数 | 执行器 | 说明 |
|-----|------|--------|------|
| `contains` | `value: string` | Code | 输出包含指定文本 |
| `not_contains` | `value: string` | Code | 输出不包含指定文本 |
| `regex_match` | `value: string (regex)` | Code | 输出匹配正则表达式 |
| `json_valid` | — | Code | 输出是合法 JSON |
| `max_length` | `value: number` | Code | 输出长度不超过 |
| `min_length` | `value: number` | Code | 输出长度不少于 |
| `exact_match` | `value: string` | Code | 输出精确匹配 |
| `starts_with` | `value: string` | Code | 输出以指定文本开头 |
| `ends_with` | `value: string` | Code | 输出以指定文本结尾 |
| `tool_called` | `value: string` | Code | 必须调用指定工具 |
| `tool_not_called` | `value: string` | Code | 不能调用指定工具 |
| `tool_count_max` | `value: number` | Code | 工具调用次数上限 |
| `tool_count_min` | `value: number` | Code | 工具调用次数下限 |
| `latency_max` | `value: number (ms)` | Code | 响应时间上限 |
| `token_max` | `value: number` | Code | Token 消耗上限 |
| `semantic_match` | `value: string` | LLM | 与参考文本语义等价 |

## 附录 B：评估维度完整参考

### 通用层（Universal）

| 维度名 | 显示名 | 评估方式 | 描述 |
|-------|--------|---------|------|
| `safety` | 安全性 | LLM + 规则 | 不输出有害/违规内容 |
| `hallucination` | 不幻觉 | LLM | 不编造不存在的信息 |
| `privacy` | 隐私保护 | LLM + 正则 | 不泄露个人隐私信息 |

### 类型层（Category）

| 维度名 | 显示名 | 适用模板 | 评估方式 |
|-------|--------|---------|---------|
| `accuracy` | 准确性 | 通用/客服 | LLM |
| `completeness` | 完整性 | 通用/代码/RAG | LLM |
| `helpfulness` | 实用性 | 通用 | LLM |
| `relevance` | 相关性 | 通用 | LLM |
| `instruction_following` | 指令遵循 | 通用/客服 | LLM |
| `problem_resolution` | 问题解决率 | 客服 | LLM |
| `response_clarity` | 回答清晰度 | 客服 | LLM |
| `empathy` | 共情能力 | 客服 | LLM |
| `code_correctness` | 代码正确性 | 代码 | LLM + Code |
| `code_quality` | 代码质量 | 代码 | LLM |
| `efficiency` | 执行效率 | 代码 | Code |
| `tool_usage` | 工具使用 | 代码 | Code |
| `retrieval_relevance` | 检索相关性 | RAG | LLM |
| `citation_accuracy` | 引用准确性 | RAG | Code + LLM |
| `answer_faithfulness` | 回答忠实度 | RAG | LLM |
| `conciseness` | 简洁性 | RAG | LLM |

## 附录 C：术语表

| 术语 | 定义 |
|------|------|
| **断言 (Assertion)** | 用户定义的、对 Agent 输出的声明式约束条件 |
| **基线 (Baseline)** | 被标记为对比基准的评测运行 |
| **退化 (Regression)** | 相对于基线，某维度得分下降超过阈值 |
| **快速失败 (Fast Fail)** | 关键断言未通过时跳过后续昂贵的 LLM 评分 |
| **Bad Case** | 被标记为有问题的评测用例，需要修复 |
| **评估模板 (Eval Template)** | 预定义的维度组合、权重和评分方式配置 |
| **确定性评估** | 结果 100% 可复现的程序化评估 |
| **非确定性评估** | 需要 LLM/人工判断、结果可能有差异的评估 |
| **ScoringEngine** | 统一的评分调度引擎，协调三级评分器 |
| **CodeScorer** | 执行确定性断言的程序化评分器 |
| **LLMScorer** | 执行语义断言和维度评分的 LLM 评分器 |
| **HumanScorer** | 接收人工评分的入口，作为最终校准基准 |
