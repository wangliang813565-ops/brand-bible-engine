<script lang="ts">
	import { page } from '$app/state';
	import { marked } from 'marked';

	let sessionId = $derived(page.params.sessionId || '');

	interface Question {
		id: number;
		question: string;
		input_type: string; // single_choice / multi_choice / text / url / email / tel
		options: string[];
		placeholder?: string | null;
		rationale: string | null;
		selected_option?: string | null;
		selected_index?: number | null;
		custom_text?: string | null;
	}

	interface RoundData {
		done: boolean;
		goal?: string;
		goal_name?: string;
		round_index?: number;
		total_questions?: number;
		goal_coverage?: Record<string, number>;
		mode?: 'normal' | 'deeper' | 'clarify';
		questions?: Question[];
		bible_markdown?: string;
		last_round_recap?: string;
	}

	interface Attachment {
		file_token: string;
		name: string;
		size: number;
		mime?: string;
	}

	let currentRound = $state<RoundData | null>(null);
	let currentQuestionIdx = $state(0); // 0-3
	let customInput = $state(''); // "其他" 输入框 或 text/url/email/tel 输入
	let multiSelected = $state<number[]>([]); // 多选题选中的 index 列表
	let attachments = $state<Attachment[]>([]); // 当前题的附件
	let uploading = $state(false);
	let loading = $state(true);
	let submitting = $state(false);
	let errorMsg = $state('');

	// 过场动画 + 点评
	let transitioning = $state(false);      // 正在从上一轮切到下一轮
	let showingRecap = $state(false);       // 当前是否在展示 recap
	let recapText = $state('');             // 点评文本

	// 档案板块的"进入前介绍页"
	let showProfileIntro = $state(false);
	let skippingProfile = $state(false);

	// 加载或请求下一轮
	async function loadNextRound(showTransition = false) {
		if (showTransition) {
			transitioning = true;
		} else {
			loading = true;
		}
		errorMsg = '';
		try {
			const resp = await fetch('/api/next-round', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ session_id: sessionId })
			});
			const data = (await resp.json()) as RoundData;
			if (!resp.ok) throw new Error((data as any).error || '加载失败');

			if (typeof localStorage !== 'undefined') {
				localStorage.setItem('bbe_session_id', sessionId);
			}

			// 如果有上一轮的点评 + 处于过场模式 → 展示点评
			if (showTransition && data.last_round_recap) {
				recapText = data.last_round_recap;
				showingRecap = true;
				// 动态停留时间：根据文字长度 1.4s - 2.2s
				const dwellMs = Math.min(2200, Math.max(1400, data.last_round_recap.length * 60));
				await new Promise((r) => setTimeout(r, dwellMs));
				showingRecap = false;
				await new Promise((r) => setTimeout(r, 120));
			}

			// 如果切入了 profile 板块、且是第 1 轮 → 先显示介绍页
			if (data.goal === 'profile' && data.round_index === 1 && !data.done) {
				showProfileIntro = true;
				// 暂不渲染题目，等用户点"开始填"或"跳过"
				currentRound = data;
				currentQuestionIdx = findFirstUnanswered(data.questions || []);
				return;
			}

			currentRound = data;
			currentQuestionIdx = findFirstUnanswered(data.questions || []);
		} catch (e: any) {
			errorMsg = e.message || '网络错误';
		} finally {
			loading = false;
			transitioning = false;
		}
	}

	function dismissProfileIntro() {
		showProfileIntro = false;
	}

	async function skipProfileEntirely() {
		if (!confirm('确定跳过档案板块吗？你将直接生成品牌圣经，但不会包含 Logo/税号/执照等资料。')) return;
		skippingProfile = true;
		errorMsg = '';
		try {
			const resp = await fetch('/api/skip-profile', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ session_id: sessionId })
			});
			const data = (await resp.json()) as RoundData;
			if (!resp.ok) throw new Error((data as any).error || '跳过失败');
			showProfileIntro = false;
			currentRound = data;
		} catch (e: any) {
			errorMsg = e.message || '网络错误';
		} finally {
			skippingProfile = false;
		}
	}

	function findFirstUnanswered(questions: Question[]): number {
		for (let i = 0; i < questions.length; i++) {
			if (!questions[i].selected_option) return i;
		}
		return questions.length - 1; // 全答完了停在最后
	}

	async function submitAnswer(
		optionIndex: number,
		optionText: string,
		customText: string | null = null
	) {
		if (!currentRound?.questions) return;
		const q = currentRound.questions[currentQuestionIdx];
		submitting = true;
		try {
			const resp = await fetch('/api/answer', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					answer_id: q.id,
					selected_index: optionIndex,
					selected_option: optionText,
					custom_text: customText,
					attachments: attachments.length > 0 ? attachments : null
				})
			});
			if (!resp.ok) {
				const err = await resp.json().catch(() => ({}));
				throw new Error((err as any).error || '提交失败');
			}
			q.selected_option = optionText;
			q.selected_index = optionIndex;
			q.custom_text = customText;
			customInput = '';
			multiSelected = [];
			attachments = [];

			if (currentQuestionIdx < (currentRound.questions?.length || 0) - 1) {
				currentQuestionIdx++;
			} else {
				// 本轮 4 题答完 → 开启过场动画
				await loadNextRound(true);
			}
		} catch (e: any) {
			errorMsg = e.message || '网络错误';
		} finally {
			submitting = false;
		}
	}

	async function handleFilePick(event: Event) {
		const input = event.target as HTMLInputElement;
		const files = input.files;
		if (!files || files.length === 0) return;

		uploading = true;
		errorMsg = '';
		try {
			for (const file of Array.from(files)) {
				const form = new FormData();
				form.append('file', file);
				const resp = await fetch('/api/upload', { method: 'POST', body: form });
				const data = (await resp.json()) as any;
				if (!resp.ok || !data.ok) {
					throw new Error(data.error || data.message || '上传失败');
				}
				attachments = [...attachments, {
					file_token: data.file_token,
					name: data.name,
					size: data.size,
					mime: data.mime
				}];
			}
			input.value = '';
		} catch (e: any) {
			errorMsg = e.message || '上传失败';
		} finally {
			uploading = false;
		}
	}

	function removeAttachment(idx: number) {
		attachments = attachments.filter((_, i) => i !== idx);
	}

	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	}

	function handleOptionClick(index: number, option: string) {
		const isOther = option.includes('其他');
		if (isOther) {
			if (!customInput.trim()) {
				errorMsg = '请先填写你的答案';
				return;
			}
			submitAnswer(index, option, customInput.trim());
		} else {
			submitAnswer(index, option, null);
		}
	}

	function toggleMultiSelect(index: number) {
		if (multiSelected.includes(index)) {
			multiSelected = multiSelected.filter((i) => i !== index);
		} else {
			multiSelected = [...multiSelected, index];
		}
	}

	function submitMultiSelect() {
		if (!currentRound?.questions) return;
		const q = currentRound.questions[currentQuestionIdx];
		if (multiSelected.length === 0) {
			errorMsg = '请至少选一项';
			return;
		}
		const selectedTexts = multiSelected.map((i) => q.options[i]).join(' | ');
		// 用索引列表 JSON 化作为 selected_option，方便后续解析
		submitAnswer(multiSelected[0], selectedTexts, customInput.trim() || null);
	}

	function submitTextInput() {
		if (!currentRound?.questions) return;
		if (!customInput.trim()) {
			errorMsg = '请填写答案（如没有请填"暂无"或"待补充"）';
			return;
		}
		submitAnswer(0, customInput.trim(), null);
	}

	function skipQuestion() {
		submitAnswer(-1, '（跳过）', null);
	}

	function goPrevQuestion() {
		if (currentQuestionIdx > 0) currentQuestionIdx--;
	}

	$effect(() => {
		if (sessionId) loadNextRound();
	});

	// 品牌圣经完成页
	let bibleHtml = $derived.by(() => {
		if (currentRound?.bible_markdown) {
			return marked.parse(currentRound.bible_markdown, { async: false }) as string;
		}
		return '';
	});

	async function downloadBible() {
		window.location.href = `/api/bible?id=${sessionId}`;
	}
</script>

{#if loading && !currentRound}
	<div class="center">
		<div class="spinner"></div>
		<p>AI 正在准备你的专属问题...</p>
	</div>
{:else if transitioning}
	<!-- 过场：AI 在看答案 / 展示点评 -->
	<div class="transition">
		{#if showingRecap && recapText}
			<div class="recap-card fade-in">
				<div class="recap-avatar">🤖</div>
				<div class="recap-body">
					<div class="recap-label">AI 听完这 4 题的反应</div>
					<p class="recap-text">{recapText}</p>
				</div>
			</div>
		{:else}
			<div class="thinking">
				<div class="dots">
					<span></span>
					<span></span>
					<span></span>
				</div>
				<p class="thinking-text">AI 在消化你刚才的回答...</p>
				<p class="thinking-sub">根据你的答案生成下一轮专属问题中</p>
			</div>
		{/if}
	</div>
{:else if showProfileIntro}
	<!-- 档案板块进入前介绍页 -->
	<div class="profile-intro fade-in">
		<div class="intro-header">
			<span class="intro-emoji">📋</span>
			<h1>最后一步：存档你的硬资料</h1>
			<p class="intro-sub">
				Logo、税号、营业执照、联系方式…… 这些客观信息，一次录入、终身复用。
			</p>
		</div>

		<div class="intro-benefits">
			<div class="benefit">
				<span class="check">✓</span>
				<div>
					<strong>自动填各种对外文档</strong>
					<p>以后生成报价单 / 发票 / 合同 / 装箱单时，AI 直接拿这些资料自动填，不用重输。</p>
				</div>
			</div>
			<div class="benefit">
				<span class="check">✓</span>
				<div>
					<strong>规范入档到飞书多维表格</strong>
					<p>所有资料包括附件（Logo、执照）都同步到你的飞书 Base，终身保存。</p>
				</div>
			</div>
			<div class="benefit">
				<span class="check">✓</span>
				<div>
					<strong>10 道题 · 约 2 分钟</strong>
					<p>每一题都可以点"暂无 / 稍后补充"跳过。不强制。</p>
				</div>
			</div>
		</div>

		<div class="intro-actions">
			<button class="primary" onclick={dismissProfileIntro} disabled={skippingProfile}>
				好，开始填（2 分钟）→
			</button>
			<button class="link-btn" onclick={skipProfileEntirely} disabled={skippingProfile}>
				{skippingProfile ? '生成圣经中…' : '跳过整个档案，直接生成圣经'}
			</button>
		</div>

		{#if errorMsg}
			<div class="error">{errorMsg}</div>
		{/if}
	</div>
{:else if currentRound?.done}
	<!-- 品牌圣经完成页 -->
	<div class="bible-page">
		<div class="bible-header">
			<h1>🎉 你的品牌圣经完成了</h1>
			<button class="primary" onclick={downloadBible}>📄 下载 Markdown</button>
		</div>
		<div class="bible-content">
			{@html bibleHtml}
		</div>

		<!-- 微信加好友卡片 -->
		<div class="wechat-card">
			<div class="wechat-header">
				<span class="wechat-emoji">💬</span>
				<div>
					<h3>想进一步聊聊怎么把这份圣经落地？</h3>
					<p>加我微信，一对一帮你把 AI 团队搭起来</p>
				</div>
			</div>
			<div class="wechat-qr-wrap">
				<img src="/wechat-qr.png" alt="微信二维码 - 王亮" class="wechat-qr" />
				<p class="wechat-hint">长按二维码 / 截图用微信扫一扫</p>
			</div>
		</div>
	</div>
{:else if currentRound?.questions}
	<!-- 答题页 -->
	{@const q = currentRound.questions[currentQuestionIdx]}
	{@const coverage = currentRound.goal_coverage || {}}

	<div class="progress-bar">
		<div class="goals">
			{#each [{ id: 'identity', name: '身份' }, { id: 'product', name: '产品' }, { id: 'acquisition', name: '获客' }, { id: 'production', name: '创作' }, { id: 'documents', name: '文书' }, { id: 'profile', name: '档案' }] as g}
				<div class="goal-chip" class:active={currentRound.goal === g.id}>
					<span class="goal-name">{g.name}</span>
					<span class="goal-pct">{coverage[g.id] || 0}%</span>
				</div>
			{/each}
		</div>
		<div class="meta">
			第 {currentRound.round_index} 轮 · 已答 {currentRound.total_questions} 题
			{#if currentRound.mode === 'deeper'}<span class="mode-badge deeper">AI 决定深挖</span>{/if}
			{#if currentRound.mode === 'clarify'}<span class="mode-badge clarify">AI 在澄清矛盾</span>{/if}
		</div>
	</div>

	<div class="question-card">
		<div class="goal-label">【{currentRound.goal_name}】</div>
		<h2>{q.question}</h2>

		{#if q.rationale}
			<div class="rationale">
				<strong>💡 为什么问这题：</strong>{q.rationale}
			</div>
		{/if}

		<!-- 附件上传区：所有题型都支持 -->
		<div class="attach-row">
			<label class="attach-btn" class:uploading={uploading}>
				📎 {uploading ? '上传中...' : '上传附件（图片/PDF/Office 文件）'}
				<input
					type="file"
					multiple
					accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
					onchange={handleFilePick}
					disabled={uploading || submitting}
				/>
			</label>
			{#if attachments.length > 0}
				<div class="attach-list">
					{#each attachments as att, i}
						<div class="attach-item">
							<span class="attach-icon">{att.mime?.startsWith('image/') ? '🖼️' : '📄'}</span>
							<span class="attach-name">{att.name}</span>
							<span class="attach-size">{formatSize(att.size)}</span>
							<button class="attach-remove" onclick={() => removeAttachment(i)} disabled={submitting}
								>✕</button
							>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		{#if q.input_type === 'text' || q.input_type === 'url' || q.input_type === 'email' || q.input_type === 'tel'}
			<!-- 文本输入题 -->
			<div class="text-input-wrap">
				<input
					type={q.input_type === 'url' ? 'url' : q.input_type === 'email' ? 'email' : q.input_type === 'tel' ? 'tel' : 'text'}
					bind:value={customInput}
					placeholder={q.placeholder || '请输入'}
					disabled={submitting}
					class="text-input"
				/>
				<div class="text-input-actions">
					<button class="secondary" onclick={skipQuestion} disabled={submitting}>
						暂无 / 稍后补充
					</button>
					<button class="primary-sm" onclick={submitTextInput} disabled={submitting || !customInput.trim()}>
						下一题 →
					</button>
				</div>
			</div>
		{:else if q.input_type === 'multi_choice'}
			<!-- 多选题 -->
			<div class="options multi">
				{#each q.options as option, i}
					{@const isOther = option.includes('其他')}
					{@const isSelected = multiSelected.includes(i)}
					<button
						class="option"
						class:selected={isSelected}
						class:other={isOther}
						onclick={() => {
							if (isOther) return;
							toggleMultiSelect(i);
						}}
						disabled={submitting}
					>
						<span class="check-box">{isSelected ? '☑' : '☐'}</span>
						{#if isOther}
							<div class="other-wrap">
								<span>{option}</span>
								<input
									type="text"
									bind:value={customInput}
									placeholder="补充其他..."
									onclick={(e) => e.stopPropagation()}
									disabled={submitting}
								/>
							</div>
						{:else}
							{option}
						{/if}
					</button>
				{/each}
			</div>
			<div class="multi-submit">
				<button class="primary-sm" onclick={submitMultiSelect} disabled={submitting || multiSelected.length === 0}>
					提交选择 ({multiSelected.length} 项) →
				</button>
			</div>
		{:else}
			<!-- 单选题（默认） -->
			<div class="options">
				{#each q.options as option, i}
					{@const isOther = option.includes('其他')}
					<button
						class="option"
						class:other={isOther}
						class:selected={q.selected_index === i}
						onclick={() => handleOptionClick(i, option)}
						disabled={submitting}
					>
						{#if isOther}
							<div class="other-wrap">
								<span>{option}</span>
								<input
									type="text"
									bind:value={customInput}
									placeholder="在这里填写你的答案"
									onclick={(e) => e.stopPropagation()}
									disabled={submitting}
								/>
							</div>
						{:else}
							{option}
						{/if}
					</button>
				{/each}
			</div>
		{/if}

		<div class="nav">
			<button onclick={goPrevQuestion} disabled={currentQuestionIdx === 0} class="secondary">
				← 上一题
			</button>
			<div class="dots">
				{#each currentRound.questions as _, i}
					<span class="dot" class:active={i === currentQuestionIdx} class:done={currentRound.questions[i].selected_option}
					></span>
				{/each}
			</div>
			<div style="width: 88px"></div>
		</div>
	</div>

	{#if errorMsg}
		<div class="error">{errorMsg}</div>
	{/if}
{:else if errorMsg}
	<div class="error">{errorMsg}</div>
{/if}

<style>
	.center {
		text-align: center;
		padding: 80px 20px;
		color: #666;
	}
	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid #eee;
		border-top-color: #333;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		margin: 0 auto 20px;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	/* 过场页 */
	.transition {
		min-height: 60vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 40px 20px;
	}
	.thinking {
		text-align: center;
	}
	.dots {
		display: flex;
		justify-content: center;
		gap: 8px;
		margin-bottom: 24px;
	}
	.dots span {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: #1a1a1a;
		animation: pulse 1.2s ease-in-out infinite;
	}
	.dots span:nth-child(2) {
		animation-delay: 0.2s;
	}
	.dots span:nth-child(3) {
		animation-delay: 0.4s;
	}
	@keyframes pulse {
		0%, 60%, 100% {
			transform: scale(1);
			opacity: 0.6;
		}
		30% {
			transform: scale(1.3);
			opacity: 1;
		}
	}
	.thinking-text {
		margin: 0 0 6px;
		font-size: 17px;
		font-weight: 600;
		color: #1a1a1a;
	}
	.thinking-sub {
		margin: 0;
		font-size: 13px;
		color: #999;
	}
	.recap-card {
		background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
		color: #fff;
		padding: 28px 24px;
		border-radius: 18px;
		max-width: 560px;
		width: 100%;
		box-shadow: 0 12px 48px rgba(0, 0, 0, 0.14);
		display: flex;
		gap: 16px;
		align-items: flex-start;
	}
	.recap-avatar {
		flex-shrink: 0;
		width: 48px;
		height: 48px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 24px;
	}
	.recap-body {
		flex: 1;
	}
	.recap-label {
		font-size: 12px;
		color: #f5a623;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 8px;
	}
	.recap-text {
		margin: 0;
		font-size: 17px;
		line-height: 1.7;
		color: #fff;
	}
	.fade-in {
		animation: fadeInUp 0.45s cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	.profile-intro {
		max-width: 640px;
		margin: 0 auto;
		padding: 24px 16px;
	}
	.intro-header {
		text-align: center;
		margin-bottom: 32px;
	}
	.intro-emoji {
		font-size: 48px;
		display: block;
		margin-bottom: 12px;
	}
	.intro-header h1 {
		margin: 0 0 10px;
		font-size: 24px;
		font-weight: 700;
	}
	.intro-sub {
		margin: 0;
		color: #666;
		font-size: 15px;
		line-height: 1.6;
	}
	.intro-benefits {
		background: #fff;
		border-radius: 16px;
		padding: 24px;
		box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
		margin-bottom: 24px;
	}
	.benefit {
		display: flex;
		gap: 12px;
		padding: 14px 0;
		border-bottom: 1px solid #f0f0f0;
	}
	.benefit:last-child {
		border-bottom: none;
	}
	.benefit .check {
		flex-shrink: 0;
		width: 24px;
		height: 24px;
		background: #0a7d3e;
		color: #fff;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 14px;
		font-weight: 700;
	}
	.benefit strong {
		display: block;
		font-size: 15px;
		color: #1a1a1a;
		margin-bottom: 4px;
	}
	.benefit p {
		margin: 0;
		color: #666;
		font-size: 13px;
		line-height: 1.6;
	}
	.intro-actions {
		display: flex;
		flex-direction: column;
		gap: 12px;
		align-items: center;
	}
	.intro-actions .primary {
		width: 100%;
		max-width: 420px;
		padding: 14px;
		font-size: 16px;
		font-weight: 600;
		background: #1a1a1a;
		color: #fff;
		border: none;
		border-radius: 10px;
		cursor: pointer;
	}
	.intro-actions .primary:hover:not(:disabled) {
		opacity: 0.88;
	}
	.intro-actions .primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.link-btn {
		background: none;
		border: none;
		color: #888;
		font-size: 14px;
		cursor: pointer;
		padding: 8px 16px;
		text-decoration: underline;
	}
	.link-btn:hover {
		color: #333;
	}
	@keyframes fadeInUp {
		from {
			opacity: 0;
			transform: translateY(16px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	.progress-bar {
		margin-bottom: 24px;
	}
	.goals {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: 6px;
		margin-bottom: 12px;
	}
	.goal-chip {
		background: #f0f0f0;
		border-radius: 8px;
		padding: 8px;
		text-align: center;
		font-size: 12px;
		color: #777;
		transition: all 0.2s;
	}
	.goal-chip.active {
		background: #1a1a1a;
		color: #fff;
	}
	.goal-name {
		display: block;
		font-weight: 600;
	}
	.goal-pct {
		display: block;
		font-size: 11px;
		opacity: 0.7;
	}
	.meta {
		text-align: center;
		font-size: 13px;
		color: #888;
	}
	.mode-badge {
		display: inline-block;
		margin-left: 8px;
		padding: 2px 8px;
		border-radius: 4px;
		font-size: 11px;
	}
	.mode-badge.deeper {
		background: #fff3cd;
		color: #856404;
	}
	.mode-badge.clarify {
		background: #f8d7da;
		color: #721c24;
	}
	.question-card {
		background: #fff;
		border-radius: 16px;
		padding: 28px 24px;
		box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
	}
	.goal-label {
		color: #888;
		font-size: 13px;
		margin-bottom: 8px;
	}
	h2 {
		font-size: 20px;
		font-weight: 600;
		margin: 0 0 20px;
		line-height: 1.5;
	}
	.rationale {
		background: #f8f9fa;
		padding: 12px 16px;
		border-radius: 8px;
		font-size: 13px;
		color: #555;
		margin-bottom: 20px;
		line-height: 1.6;
	}
	.options {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-bottom: 20px;
	}
	.option {
		text-align: left;
		padding: 14px 18px;
		font-size: 15px;
		background: #fff;
		border: 1.5px solid #e0e0e0;
		border-radius: 10px;
		cursor: pointer;
		font-family: inherit;
		line-height: 1.4;
		transition: all 0.15s;
	}
	.option:hover:not(:disabled) {
		border-color: #1a1a1a;
		background: #fafafa;
	}
	.option.selected {
		border-color: #1a1a1a;
		background: #1a1a1a;
		color: #fff;
	}
	.option:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.option.other .other-wrap {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.option.other input {
		width: 100%;
		padding: 8px 10px;
		border: 1px solid #ccc;
		border-radius: 6px;
		font-size: 14px;
		font-family: inherit;
	}
	.option.other.selected input {
		color: #333;
		background: #fff;
	}
	.check-box {
		display: inline-block;
		margin-right: 8px;
		font-size: 16px;
	}
	.multi-submit {
		display: flex;
		justify-content: flex-end;
		margin-bottom: 16px;
	}
	.text-input-wrap {
		margin-bottom: 20px;
	}
	.text-input {
		width: 100%;
		font-size: 16px;
		padding: 14px 16px;
		border: 1.5px solid #e0e0e0;
		border-radius: 10px;
		font-family: inherit;
		margin-bottom: 12px;
	}
	.text-input:focus {
		outline: none;
		border-color: #1a1a1a;
	}
	.text-input-actions {
		display: flex;
		justify-content: space-between;
		gap: 12px;
	}
	.primary-sm {
		padding: 10px 20px;
		background: #1a1a1a;
		color: #fff;
		border: none;
		border-radius: 8px;
		font-size: 14px;
		cursor: pointer;
		font-family: inherit;
	}
	.primary-sm:hover {
		opacity: 0.85;
	}
	.primary-sm:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.attach-row {
		margin-bottom: 20px;
		padding: 14px;
		background: #f8f9fa;
		border: 1px dashed #d0d0d0;
		border-radius: 10px;
	}
	.attach-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 14px;
		background: #fff;
		border: 1px solid #ddd;
		border-radius: 6px;
		font-size: 13px;
		color: #555;
		cursor: pointer;
		transition: all 0.15s;
	}
	.attach-btn:hover {
		border-color: #1a1a1a;
		color: #1a1a1a;
	}
	.attach-btn.uploading {
		pointer-events: none;
		opacity: 0.6;
	}
	.attach-btn input[type='file'] {
		display: none;
	}
	.attach-list {
		margin-top: 12px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.attach-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 10px;
		background: #fff;
		border: 1px solid #e8e8e8;
		border-radius: 6px;
		font-size: 13px;
	}
	.attach-icon {
		font-size: 16px;
	}
	.attach-name {
		flex: 1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		color: #333;
	}
	.attach-size {
		color: #888;
		font-size: 12px;
	}
	.attach-remove {
		background: none;
		border: none;
		color: #888;
		cursor: pointer;
		font-size: 14px;
		padding: 0 4px;
	}
	.attach-remove:hover {
		color: #d00;
	}
	.nav {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-top: 20px;
	}
	.secondary {
		background: none;
		border: 1px solid #ddd;
		padding: 8px 16px;
		border-radius: 6px;
		font-size: 14px;
		cursor: pointer;
		font-family: inherit;
	}
	.secondary:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.dots {
		display: flex;
		gap: 8px;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #ddd;
		transition: all 0.2s;
	}
	.dot.done {
		background: #999;
	}
	.dot.active {
		background: #1a1a1a;
		transform: scale(1.3);
	}
	.error {
		background: #fff5f5;
		color: #d00;
		padding: 12px 16px;
		border-radius: 8px;
		margin-top: 16px;
		font-size: 14px;
	}
	.bible-page {
		padding: 20px 0;
	}
	.bible-header {
		text-align: center;
		margin-bottom: 32px;
	}
	.bible-header h1 {
		font-size: 28px;
		margin: 0 0 20px;
	}
	.primary {
		padding: 12px 24px;
		background: #1a1a1a;
		color: #fff;
		border: none;
		border-radius: 8px;
		font-size: 16px;
		cursor: pointer;
		font-family: inherit;
	}
	.primary:hover {
		opacity: 0.85;
	}
	.bible-content {
		background: #fff;
		border-radius: 16px;
		padding: 40px 32px;
		box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
		line-height: 1.8;
	}
	.bible-content :global(h1) {
		font-size: 26px;
		margin-top: 0;
	}
	.bible-content :global(h2) {
		font-size: 22px;
		margin-top: 32px;
		border-bottom: 1px solid #eee;
		padding-bottom: 8px;
	}
	.bible-content :global(h3) {
		font-size: 18px;
		margin-top: 24px;
	}
	.bible-content :global(table) {
		width: 100%;
		border-collapse: collapse;
		margin: 16px 0;
	}
	.bible-content :global(th),
	.bible-content :global(td) {
		border: 1px solid #ddd;
		padding: 8px 12px;
		text-align: left;
	}
	.bible-content :global(th) {
		background: #f8f9fa;
	}
	.bible-content :global(blockquote) {
		border-left: 3px solid #ddd;
		padding-left: 16px;
		color: #666;
		margin: 16px 0;
	}
	.bible-content :global(code) {
		background: #f5f5f5;
		padding: 2px 6px;
		border-radius: 3px;
		font-size: 90%;
	}
	.wechat-card {
		margin-top: 32px;
		background: linear-gradient(135deg, #0a7d3e 0%, #1dab4e 100%);
		color: #fff;
		border-radius: 20px;
		padding: 32px 28px;
		box-shadow: 0 8px 32px rgba(10, 125, 62, 0.24);
		text-align: center;
	}
	.wechat-header {
		display: flex;
		align-items: center;
		gap: 16px;
		margin-bottom: 24px;
		text-align: left;
	}
	.wechat-emoji {
		font-size: 40px;
	}
	.wechat-header h3 {
		margin: 0 0 4px;
		font-size: 19px;
		font-weight: 700;
		color: #fff;
	}
	.wechat-header p {
		margin: 0;
		font-size: 14px;
		color: rgba(255, 255, 255, 0.9);
	}
	.wechat-qr-wrap {
		background: #fff;
		padding: 20px;
		border-radius: 16px;
		display: inline-block;
	}
	.wechat-qr {
		width: 240px;
		height: 240px;
		object-fit: contain;
		display: block;
		margin: 0 auto 12px;
	}
	.wechat-hint {
		margin: 0;
		font-size: 13px;
		color: #555;
	}
	@media (max-width: 560px) {
		.wechat-header {
			flex-direction: column;
			text-align: center;
			gap: 8px;
		}
		.wechat-qr {
			width: 200px;
			height: 200px;
		}
	}
</style>
