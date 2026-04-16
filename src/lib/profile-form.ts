// Profile (档案) 板块的固定题目清单
// 这一块不走 AI 生成，写死的原因：
//   1. 档案信息是客观事实，AI 不需要"创意"，反而可能问偏
//   2. 老大要的是规范化数据入库（飞书 Bitable），字段要确定
//   3. 固定题目更快（不用调 LLM）

import type { QuestionInputType } from './research-goals';

export interface ProfileQuestion {
	question: string;
	input_type: QuestionInputType;
	placeholder?: string;
	options?: string[];
	rationale: string; // 给用户看的"为什么问这题"
	allow_attachment?: boolean; // 是否特别提示可以上传附件
}

export const PROFILE_QUESTIONS: ProfileQuestion[] = [
	{
		question: '你的品牌 Logo 在哪？可以直接上传图片，也可以贴一个能访问的 URL。',
		input_type: 'url',
		placeholder: 'https://yourbrand.com/logo.png  或留空仅上传附件',
		rationale: 'Logo 是后续自动生成报价单、发票、合同等所有对外文档时会自动带上的第一元素。',
		allow_attachment: true
	},
	{
		question: '官方网址是？',
		input_type: 'url',
		placeholder: 'https://www.yourbrand.com  或填"待建"',
		rationale: '网址会写进所有对外文档的页脚和签名栏。'
	},
	{
		question: '对外联系邮箱？',
		input_type: 'email',
		placeholder: 'contact@yourbrand.com',
		rationale: '客户咨询、发票抬头、合同回执等都需要这个邮箱。'
	},
	{
		question: '对外联系电话 / WhatsApp？',
		input_type: 'tel',
		placeholder: '+971 55 XXX XXXX  或 +86 138 XXXX XXXX',
		rationale: 'AI 客服、社媒卡片、WhatsApp 询盘跳转都会用到。'
	},
	{
		question: '公司注册地址？（完整地址，用于合同和发票）',
		input_type: 'text',
		placeholder: '示例：Office 1203, Business Bay, Dubai, UAE',
		rationale: '合同、发票、装箱单的"甲方地址"都会自动带上。'
	},
	{
		question: '税号 / VAT / GST 号码？',
		input_type: 'text',
		placeholder: '示例：VAT 100123456789003',
		rationale: '发票必填信息。在中东做 B2B，税号不完整会被客户退票。'
	},
	{
		question: '营业执照号 / 公司注册号？',
		input_type: 'text',
		placeholder: '示例：Trade License 1234567 / 注册号 91110000XXXXXXXXX',
		rationale: '合作方审核合规性会要这个。可顺便上传执照附件。',
		allow_attachment: true
	},
	{
		question: '法人 / 负责人姓名？（用于合同签署）',
		input_type: 'text',
		placeholder: '示例：Leon Wang / 王亮',
		rationale: '合同末尾的"签字人"会带上。'
	},
	{
		question: '对外销售抬头 / 开票公司全称？',
		input_type: 'text',
		placeholder: '示例：MUSE Trendy Toy LLC',
		rationale: '开发票、签合同时的"甲方名"。有些公司"品牌名"和"法人名"不一样。'
	},
	{
		question: '社媒账号清单（IG / FB / LinkedIn / TikTok / 小红书 / 抖音 / X）',
		input_type: 'text',
		placeholder: '示例：IG @musetrendytoy / LinkedIn /company/muse / 小红书 MUSE',
		rationale: '生成内容时，AI 知道在哪几个平台发、用什么 handle。'
	}
];

export const QUESTIONS_PER_ROUND_PROFILE = 4; // 与其他板块保持一致
export const PROFILE_TOTAL_ROUNDS = Math.ceil(
	PROFILE_QUESTIONS.length / QUESTIONS_PER_ROUND_PROFILE
); // = 3（4+4+2）

/** 给指定轮次取题 */
export function getProfileQuestionsForRound(roundIndex: number): ProfileQuestion[] {
	const start = (roundIndex - 1) * QUESTIONS_PER_ROUND_PROFILE;
	return PROFILE_QUESTIONS.slice(start, start + QUESTIONS_PER_ROUND_PROFILE);
}
