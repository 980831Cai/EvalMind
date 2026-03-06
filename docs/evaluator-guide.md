# LLM-as-a-Judge 评估器 使用教程

## 1. 核心概念

评估器采用 **三层架构**：

| 层级 | 说明 | 类比 |
|------|------|------|
| **模板 (Template)** | 定义评估 Prompt 和变量，是评估逻辑的"蓝图" | 函数定义 |
| **配置 (Config)** | 将模板绑定到具体使用场景：指定变量映射、模型、采样率 | 函数实例化 |
| **执行 (Execution)** | 对某条 Trace 运行一次评估，得到评分 + 理由 | 函数调用结果 |

**工作流程简述：**

```
Trace 数据 → 提取变量 → 填入模板 Prompt → 调用 Judge LLM → 解析结构化评分 → 写入 Langfuse Score
```

---

## 2. 前置配置：设置 Judge LLM

评估器需要调用一个 LLM 作为"裁判"来对 Trace 打分。系统使用 **标准 OpenAI Chat Completions API 格式**，兼容以下服务：

- OpenAI（GPT-4o 等）
- DeepSeek
- 本地 Ollama
- vLLM / Azure OpenAI / 任何 OpenAI 兼容服务

### 配置方法

编辑 `backend/.env` 文件，设置三个环境变量：

```env
# JUDGE_LLM_BASE_URL: API 地址（到 /v1 级别，不含 /chat/completions）
# JUDGE_LLM_API_KEY: API Key
# JUDGE_LLM_MODEL: 默认使用的模型名称
```

### 配置示例

**使用 OpenAI：**
```env
JUDGE_LLM_BASE_URL=https://api.openai.com/v1
JUDGE_LLM_API_KEY=sk-xxxxxxxxxxxxxxxx
JUDGE_LLM_MODEL=gpt-4o
```

**使用 DeepSeek：**
```env
JUDGE_LLM_BASE_URL=https://api.deepseek.com/v1
JUDGE_LLM_API_KEY=sk-xxxxxxxxxxxxxxxx
JUDGE_LLM_MODEL=deepseek-chat
```

**使用本地 Ollama：**
```env
JUDGE_LLM_BASE_URL=http://localhost:11434/v1
JUDGE_LLM_API_KEY=ollama
JUDGE_LLM_MODEL=qwen2.5:14b
```

> **注意**：修改 `.env` 后需重启后端服务才能生效。

---

## 3. 快速开始：5 步完成一次评测

### Step 1：进入评估器页面

在左侧导航栏点击 **评测管理 → 评估器**，进入 LLM-as-a-Judge 评估器页面。

页面有三个 Tab：
- **评估器配置**：已创建的评估器列表，可执行评测
- **模板库**：查看预置模板和自定义模板
- **执行记录**：所有评测执行的结果

### Step 2：浏览模板库

切换到 **模板库** Tab，可以看到系统预置的 6 个评估模板：

| 模板 | 用途 | 分数含义 |
|------|------|---------|
| **Hallucination** | 检测幻觉 | 分数越高 = 幻觉越严重 |
| **Helpfulness** | 评估有用性 | 分数越高 = 越有帮助 |
| **Relevance** | 评估相关性 | 分数越高 = 越相关 |
| **Correctness** | 评估正确性（需参考答案） | 分数越高 = 越正确 |
| **Toxicity** | 检测有害内容 | 分数越高 = 越有害 |
| **Conciseness** | 评估简洁性 | 分数越高 = 越简洁 |

点击模板卡片可展开查看完整的 Prompt 内容和变量列表。

### Step 3：创建评估器

1. 点击右上角 **「新建评估器」** 按钮
2. 填写表单：

| 字段 | 说明 | 示例 |
|------|------|------|
| **评估器名称** | 评估器的名称，便于识别 | `幻觉检测-v1` |
| **选择模板** | 从预置或自定义模板中选择 | `Hallucination` |
| **Score 名称** | 评分结果在 Langfuse 中显示的名称 | `Hallucination`（自动填充） |
| **变量映射** | 将模板变量映射到 Trace 字段 | 见下方说明 |
| **模型名称** | 可选，覆盖系统默认模型 | 留空 或 `gpt-4o` |
| **采样率** | 0~1，1.0 = 评测所有 Trace | `1.0` |
| **描述** | 可选的用途说明 | `检测 Agent 回答中的幻觉` |

3. 点击 **「创建评估器」**

### Step 4：执行评测

在 **评估器配置** Tab 中，找到刚创建的评估器卡片，点击 **「执行」** 按钮。

弹窗中有两种模式：

**模式一：批量评测最近 Trace**
- 系统自动从 Langfuse 拉取最近的 Trace
- 设置"最多处理条数"（默认 20 条）
- 点击「开始评测」

**模式二：指定 Trace ID**
- 手动输入要评测的 Trace ID（每行一个或逗号分隔）
- 适合针对性评测特定 Trace
- 点击「开始评测」

> 评测在后台异步执行，提交后可继续操作。

### Step 5：查看结果

切换到 **执行记录** Tab，可以看到所有评测结果：

- **评分**：0~100% 的数值
- **理由**：LLM 给出的一句话评分解释
- **状态**：completed（完成）/ running（进行中）/ failed（失败）

点击右侧 **眼睛图标** 可查看详情，包括：
- 完整的编译后 Prompt（实际发给 LLM 的内容）
- 详细的评分理由
- 如果失败，显示错误信息

评分结果会**自动上报到 Langfuse**，在 Langfuse 的 Trace 详情中可以看到对应的 Score。

---

## 4. 变量映射详解

变量映射是评估器最核心的配置，它决定了模板中的 `{{变量}}` 从 Trace 的哪个字段取值。

### 基本映射

选择模板后，系统会自动推断映射关系：

| 模板变量 | 自动映射到 | 含义 |
|---------|-----------|------|
| `{{query}}` / `{{question}}` / `{{input}}` | Input | Trace 的输入 |
| `{{generation}}` / `{{answer}}` / `{{output}}` / `{{response}}` | Output | Trace 的输出 |

### 可映射的 Trace 字段

| 字段 | 说明 |
|------|------|
| **Input** | Trace 的 input，通常是用户提问 |
| **Output** | Trace 的 output，通常是 Agent 回答 |
| **Metadata** | Trace 的元数据（JSON 对象） |
| **Name** | Trace 的名称 |
| **Tags** | Trace 的标签数组 |

### JSONPath 提取（高级）

如果 Trace 的 Input/Output/Metadata 是 JSON 对象，可以用 JSONPath 提取其中的特定字段。

**示例：** Trace 的 input 是 `{"messages": [{"role": "user", "content": "你好"}]}`

- 变量 `{{query}}` → Trace 字段: `Input` → JSONPath: `messages.0.content`
- 提取结果：`"你好"`

JSONPath 语法：用 `.` 分隔层级，数组用数字下标（从 0 开始）。

---

## 5. 自定义模板

如果预置模板不满足需求，可以创建自定义评估模板。

### 创建步骤

1. 切换到 **模板库** Tab
2. 点击 **「自定义模板」** 按钮
3. 填写：
   - **模板名称**：如 `代码质量检查`
   - **变量名**：逗号分隔，如 `query, generation`
   - **Prompt 模板**：评估指令，用 `{{变量名}}` 标记变量位置

### Prompt 编写要点

1. **明确评分标准**：告诉 LLM 什么样的回答得高分/低分
2. **使用 0~1 分数**：系统期望 score 在 0~1 之间
3. **变量用双大括号**：`{{query}}`、`{{generation}}`
4. **引导结构化输出**：系统会自动添加 JSON 格式要求，你只需关注评估逻辑

### 示例 Prompt

```
评估以下 Agent 回答的代码质量（0-1分）。

评估维度：
- 代码是否正确、可运行
- 是否有适当的错误处理
- 代码风格是否清晰规范
- 是否有安全隐患

用户问题: {{query}}
Agent 回答: {{generation}}

请逐步分析后给出评分。
```

---

## 6. 高级用法

### 6.1 Per-Evaluator 模型覆盖

每个评估器配置可以指定不同的 Judge 模型：

- 留空 → 使用 `.env` 中的 `JUDGE_LLM_MODEL`（系统默认）
- 填写具体模型名 → 使用指定模型（如 `gpt-4o`、`deepseek-chat`）

**使用场景**：对于关键评估维度使用更强的模型（如 GPT-4o），简单评估用更经济的模型。

### 6.2 采样率控制

- `1.0`（默认）：评测所有提交的 Trace
- `0.5`：随机评测 50% 的 Trace
- `0.1`：随机评测 10% 的 Trace

**使用场景**：Trace 量大时，通过采样降低 LLM 调用成本，同时保持统计显著性。

### 6.3 Langfuse Score 集成

每次评测成功后，结果会自动上报到 Langfuse 作为 Score：

- **Score Name**：就是评估器配置中的"Score 名称"
- **Score Value**：0~1 的评分
- **Comment**：评分理由
- **Source**：`EVAL`（标识为自动评测产生）

在 Langfuse UI 中，你可以：
- 在 Trace 详情页看到评分
- 在 Score 面板中按评估维度筛选和统计
- 基于 Score 做趋势分析

### 6.4 Correctness 模板的特殊用法

`Correctness`（正确性）模板有 3 个变量：`{{query}}`、`{{generation}}`、`{{ground_truth}}`。

其中 `ground_truth`（参考答案）无法自动映射，需要你：
1. 将参考答案存储在 Trace 的 Metadata 中（如 `{"ground_truth": "正确答案"}`）
2. 在变量映射中：`{{ground_truth}}` → Trace 字段: `Metadata` → JSONPath: `ground_truth`

---

## 7. 常见问题

### Q: 评测失败，提示"未配置评分 LLM"
检查 `.env` 中是否正确设置了 `JUDGE_LLM_BASE_URL` 和 `JUDGE_LLM_API_KEY`，并重启后端。

### Q: 评测失败，提示"未配置评分模型"
检查 `.env` 中是否设置了 `JUDGE_LLM_MODEL`，或在评估器配置中指定了模型名称。

### Q: 评分结果为空或解析失败
可能是 LLM 未按 JSON 格式返回结果。在"执行详情"中查看"编译后的 Prompt"确认发送内容是否正确，也可以尝试更换更强的 Judge 模型。

### Q: 如何评测不同类型的 Agent？
本平台不限制 Agent 的开发平台和调用方式。只要你的 Agent 调用数据通过 Langfuse SDK 上报了 Trace，评估器就可以对其进行评测。无论你使用的是 LangChain、LlamaIndex、自研框架，还是任何其他方式构建的 Agent，只需确保 Trace 中包含 input 和 output 即可。

### Q: 采样率设置为 0.5，为什么有时评测数量不是恰好一半？
采样是随机的，每条 Trace 独立以 50% 概率决定是否评测，实际数量会在预期值附近波动。
