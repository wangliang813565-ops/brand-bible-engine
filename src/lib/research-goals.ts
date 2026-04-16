// 调研目标树 — 固定的"要了解什么"，不是"怎么问"

export type GoalId =
	| 'profile' // 硬档案（Logo/网址/邮箱/电话/税号/营业执照）— 必填
	| 'identity' // 我是谁
	| 'product' // 卖什么
	| 'acquisition' // 怎么获客
	| 'production' // 怎么创作
	| 'documents'; // 日常文书（发票/报价单/合同）摸排

export interface Goal {
	id: GoalId;
	name: string;
	description: string;
	sub_goals: string[];
	key_questions: string[]; // 用来评估覆盖度
}

export const RESEARCH_GOALS: Record<GoalId, Goal> = {
	profile: {
		id: 'profile',
		name: '硬档案',
		description: '品牌/公司的必备信息 — 永久保存的客户档案',
		sub_goals: [
			'品牌 Logo（URL 或描述）',
			'官方网址',
			'联系邮箱',
			'联系电话 / WhatsApp',
			'注册地址',
			'税号 / VAT / GST',
			'营业执照号 / 公司注册号',
			'法人姓名',
			'对外销售抬头',
			'银行账户信息（选填）',
			'社媒账号清单'
		],
		key_questions: [
			'你的品牌 Logo 在哪？（图片 URL 或 Google Drive 链接）',
			'你的官网是？（完整 URL，没有则填"待建"）',
			'对外联系邮箱？',
			'对外联系电话 / WhatsApp？',
			'公司注册地址？',
			'税号 / VAT / GST 号码？',
			'营业执照编号 / 公司注册号？',
			'法人姓名？',
			'开发票/合同上用的公司抬头？',
			'社媒账号（IG/FB/LinkedIn/小红书/抖音等）？'
		]
	},
	identity: {
		id: 'identity',
		name: '我是谁',
		description: '用户的真实身份、人设、价值观、红线',
		sub_goals: [
			'创始人真实身份与背景',
			'对外呈现的人设',
			'核心价值观与故事',
			'IP 代言人/角色（如有）',
			'品牌红线（绝对禁忌）'
		],
		key_questions: [
			'你真实的身份背景是什么？（职业/经历/所在地）',
			'你对外想呈现一个什么样的人？',
			'你为什么做这个？有什么故事？',
			'你有没有一个吉祥物/代言形象？',
			'什么事绝对不能做？（价格/竞品/宗教/政治等红线）'
		]
	},
	product: {
		id: 'product',
		name: '卖什么',
		description: '变现路径、产品矩阵、卖点、客户画像',
		sub_goals: [
			'变现路径（卖货/引流/广告/打赏）',
			'商业定位',
			'产品矩阵',
			'核心卖点',
			'目标客户画像',
			'差异化壁垒'
		],
		key_questions: [
			'你靠什么赚钱？主要变现方式是什么？',
			'你的产品是实物/服务/信息？主推是什么？',
			'客户为什么选你不选别人？你的核心壁垒是什么？',
			'目标客户是谁？他们的痛点是什么？',
			'你的价格带是多少？客单价？',
			'有没有竞品？你跟他们差在哪？'
		]
	},
	acquisition: {
		id: 'acquisition',
		name: '怎么获客',
		description: '选题、脚本、平台、算法、投放、私域',
		sub_goals: [
			'选题策略',
			'脚本偏好',
			'爆款元素',
			'平台矩阵',
			'算法与投放',
			'互动与私域',
			'KPI 与复盘'
		],
		key_questions: [
			'主要在哪些平台做内容？（IG/抖音/小红书/B站/LinkedIn等）',
			'你最擅长哪种内容？（晒过程/讲故事/教知识/说观点）',
			'你的选题来源是什么？（热点/经历/客户问题/同行）',
			'发帖频率？每周几条？',
			'愿意投流吗？月预算？',
			'如何承接流量？（WhatsApp/微信/官网/DM）',
			'怎么衡量做得好不好？最看重什么指标？'
		]
	},
	production: {
		id: 'production',
		name: '怎么创作和发布',
		description: '内容支柱、文案、视觉、拍摄、剪辑、团队',
		sub_goals: [
			'内容支柱比例',
			'文案铁律',
			'视觉审美标准',
			'拍摄规范',
			'剪辑规范',
			'发布 SOP',
			'工具栈',
			'团队分工'
		],
		key_questions: [
			'内容类型占比？（产品展示/教学/故事/新闻 等）',
			'文案风格？（正式/口语/网感/专业）',
			'视觉风格？（极简/街头/奢华/复古/卡通）',
			'有没有品牌色和字体规范？',
			'谁负责生产？（你自己/团队/外包/AI）',
			'一条内容从构思到发布大概多少时间？',
			'发布时间习惯？（哪几个时段）',
			'有没有审核环节？'
		]
	},
	documents: {
		id: 'documents',
		name: '日常文书',
		description: '日常业务中用到的文书工作类型 — 摸排以便对接 AI 技能自动生成',
		sub_goals: [
			'报价单（Quotation）',
			'发票（Invoice）',
			'收据（Receipt）',
			'合同/协议（Contract/Agreement）',
			'采购订单（PO）',
			'装箱单 / 发货单（Packing List / Delivery Note）',
			'对账单（Statement）',
			'入职/雇佣合同',
			'NDA 保密协议',
			'授权书（Authorization Letter）',
			'公司简介 PDF',
			'产品目录 PDF',
			'投标书 / 提案（Proposal）'
		],
		key_questions: [
			'日常做生意常用哪些文书？（多选）',
			'报价单用什么工具做？（Excel/Word/Canva/模板）',
			'发票多久开一次？一个月几张？',
			'合同要不要走法务审核？',
			'有没有现成的文书模板想 AI 自动填？',
			'PDF 文档要不要双语（中英/中阿）？',
			'文书签字用电子签还是实体签？',
			'谁负责开票 / 做报价？（自己/会计/助理）'
		]
	}
};

export const GOAL_ORDER: GoalId[] = [
	'profile', // 先填硬档案
	'identity',
	'product',
	'acquisition',
	'production',
	'documents' // 最后摸排文书
];

// 收敛策略参数（不同目标有不同节奏）
export const QUESTIONS_PER_ROUND = 4;
export const COVERAGE_THRESHOLD = 80; // 覆盖度 ≥ 80 可切换

// 默认（identity/product/acquisition/production）每目标 10-20 轮
export const MIN_ROUNDS_PER_GOAL = 10;
export const MAX_ROUNDS_PER_GOAL = 20;

// 按目标独立配置
export const GOAL_ROUND_CONFIG: Record<GoalId, { min: number; max: number }> = {
	profile: { min: 3, max: 5 }, // 硬档案：填表性质，3-5 轮足够
	identity: { min: 10, max: 20 },
	product: { min: 10, max: 20 },
	acquisition: { min: 10, max: 20 },
	production: { min: 10, max: 20 },
	documents: { min: 3, max: 6 } // 文书摸排：3-6 轮确定用什么文书
};

// 题型（前端据此渲染）
export type QuestionInputType =
	| 'single_choice' // 单选（默认）
	| 'multi_choice' // 多选（documents 用）
	| 'text' // 自由文本
	| 'url' // URL 输入
	| 'email'
	| 'tel';
