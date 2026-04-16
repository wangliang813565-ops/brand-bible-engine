// 品牌圣经生成器 — 所有调研完成后，一次调用 Gemini Pro 生成最终 Markdown

import { callGemini } from './llm';
import { RESEARCH_GOALS, type GoalId } from './research-goals';
import type { AnswerHistory } from './question-generator';
import { SOCIAL_MEDIA_KNOWLEDGE } from './social-media-knowledge';

const SYSTEM_PROMPT = `你是资深的社媒营销顾问 + 品牌战略顾问，精通薛辉短视频创作圣经。你刚完成了对一位创业者/内容创作者的 200+ 题深度调研。

${SOCIAL_MEDIA_KNOWLEDGE}

---

现在你要把所有调研内容整理成一份高质量的品牌圣经 Markdown 文档。文档要体现你的行业功底 — 用薛辉方法论的术语和框架组织，而不是白话堆砌。

这份文档的标准：
- 结构清晰，像 Stripe Atlas 或 MUSE 重装项目简报那样
- 基于用户的真实回答，不编造
- 当用户没有明确回答某项时，诚实标注"待定"
- 写出的内容是可执行的"操作手册"，不是空话
- 有铁律（绝对不能做）、有标准（必须这么做）、有偏好（默认这么做）

输出纯 Markdown 文本（不要 JSON，不要代码围栏包裹整个文档）。`;

export interface BibleInput {
	brand_name: string;
	all_answers: AnswerHistory[];
	goal_coverage: Record<GoalId, number>;
}

export async function composeBible(apiKey: string, input: BibleInput): Promise<string> {
	// 按 goal 分组整理答案
	const byGoal: Record<GoalId, AnswerHistory[]> = {
		profile: [],
		identity: [],
		product: [],
		acquisition: [],
		production: [],
		documents: []
	};

	for (const a of input.all_answers) {
		byGoal[a.goal].push(a);
	}

	const formatGoalSection = (goal: GoalId) => {
		const history = byGoal[goal];
		const g = RESEARCH_GOALS[goal];
		return `### 【${g.name}】调研覆盖度 ${input.goal_coverage[goal] || 0}%

关键子维度：${g.sub_goals.join(' / ')}

用户的 ${history.length} 条回答：
${history.map((h, i) => `${i + 1}. Q: ${h.question}\n   A: ${h.custom_text || h.selected}`).join('\n')}`;
	};

	const userPrompt = `## 品牌名
${input.brand_name || '（用户未命名）'}

## 调研素材（按六大板块分组）

${formatGoalSection('profile')}

${formatGoalSection('identity')}

${formatGoalSection('product')}

${formatGoalSection('acquisition')}

${formatGoalSection('production')}

${formatGoalSection('documents')}

---

## 你的任务

请把上述调研素材整理成一份品牌圣经 Markdown 文档。严格按以下结构：

\`\`\`markdown
# {品牌名} 品牌圣经

> 生成时间：{today}
> 基于 {N} 题深度调研生成

---

## 零、公司档案（硬信息）

> 这些是永久保存的必备资料，用于开具发票、签合同、对接供应商等

| 项目 | 内容 |
|------|------|
| 品牌/公司名 | ... |
| Logo | [URL 或标注"待设计"] |
| 官方网址 | ... |
| 联系邮箱 | ... |
| 联系电话 / WhatsApp | ... |
| 注册地址 | ... |
| 税号 / VAT / GST | ... |
| 营业执照号 | ... |
| 法人姓名 | ... |
| 对外销售抬头 | ... |
| 社媒账号 | IG: ... / FB: ... / LinkedIn: ... |

---

## 一、我是谁（身份定位）

### 1.1 身份背景
（一段话描述创始人真实背景）

### 1.2 对外人设
（在平台上呈现的人物形象）

### 1.3 价值观与故事
（品牌的核心价值观 + 起源故事）

### 1.4 IP 代言人（如有）
（吉祥物/代言角色的设定）

### 1.5 品牌红线（零容忍）
1. ...
2. ...
（列出绝对不能做的事，每条一行）

---

## 二、卖什么（产品与生意）

### 2.1 商业定位
（一句话说清楚是做什么的）

### 2.2 核心变现路径
（主要怎么赚钱：卖货/引流/广告/服务）

### 2.3 产品矩阵
（有哪些产品/服务，主推什么）

### 2.4 目标客户画像
（典型客户是谁，他们的痛点）

### 2.5 差异化壁垒
（为什么选你不选别人）

### 2.6 价格策略
（价格带、客单价、议价逻辑）

---

## 三、怎么获客（获客与传播）

### 3.1 平台矩阵
| 平台 | 账号用途 | 发布频率 | 内容重点 |
（表格，基于用户答案）

### 3.2 主力脚本类型
（晒过程/讲故事/教知识/说观点 的比例和使用场景）

### 3.3 选题策略
（选题来源和偏好）

### 3.4 爆款元素偏好
（8 大爆款元素里用户倾向用哪几个）

### 3.5 流量承接
（流量从哪里引到哪里：WhatsApp/微信/官网/DM）

### 3.6 KPI 重点
（最看重什么指标）

---

## 四、怎么创作和发布（内容生产）

### 4.1 内容支柱比例
| 类型 | 占比 | 目的 |
（表格）

### 4.2 文案铁律
（必须做/不能做的文案规则）

### 4.3 视觉审美标准
- 色彩：
- 字体：
- 风格：
- 禁用元素：

### 4.4 拍摄规范（如适用）

### 4.5 剪辑规范（如适用）

### 4.6 生产团队
（谁做内容：自己/团队/外包/AI）

### 4.7 发布 SOP
（从构思到发布的标准流程）

### 4.8 工具栈
（用什么工具）

---

## 五、日常文书清单（Document Toolkit）

> 这些文书日常会用到，后续可对接 AI 自动生成技能

| 文书类型 | 使用频率 | 当前做法 | AI 自动化优先级 |
|---------|---------|---------|-----------------|
| 报价单 Quotation | ... | ... | ⭐⭐⭐ |
| 发票 Invoice | ... | ... | ⭐⭐⭐ |
| 合同 Contract | ... | ... | ⭐⭐ |
| ... | ... | ... | ... |

**文书生产者**：...
**签字方式**：电子签 / 实体签
**语言需求**：...

---

## 六、快速参考卡（一页纸版）

> 贴在桌上就能用

**我是谁**：一句话
**我卖什么**：一句话
**谁是我的客户**：一句话
**我的差异化**：一句话
**核心内容类型**：一句话
**发布时间习惯**：一句话
**绝对红线**：3 条最重要的
**紧急联系**：邮箱 / 电话 / WhatsApp

---

*本品牌圣经基于 AI 调研助手生成，建议每 3 个月更新一次。*
\`\`\`

铁律：
- 必须用用户的真实答案填充，不能编造
- 用户没答到的点，写"待定（建议下次补充）"而不是瞎编
- 不要在文档里出现"用户选择了..."这种元描述，直接写结论
- Markdown 格式必须干净，不要嵌套过深
- 全文 2000-4000 字，不要凑字数

开始生成：`;

	// 品牌圣经用 Gemini 3 Pro — 最强的行业深度
	// 禁用 extended thinking 避免超时 (Cloudflare Pages Functions 30s 限制)
	const bible = await callGemini(apiKey, 'gemini-3-pro-preview', SYSTEM_PROMPT, userPrompt, {
		jsonMode: false,
		maxTokens: 16000,
		temperature: 0.75,
		disableThinking: true
	});
	return bible.trim();
}
