<script lang="ts">
	let brandName = $state('');
	let loading = $state(false);
	let errorMsg = $state('');
	let savedId = $state<string | null>(null);

	$effect(() => {
		if (typeof localStorage !== 'undefined') {
			savedId = localStorage.getItem('bbe_session_id');
		}
	});

	async function startNew() {
		loading = true;
		errorMsg = '';
		try {
			const resp = await fetch('/api/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ brand_name: brandName || null })
			});
			const data = (await resp.json()) as { session_id: string };
			if (!resp.ok) throw new Error((data as any).error || '创建失败');
			if (typeof localStorage !== 'undefined') {
				localStorage.setItem('bbe_session_id', data.session_id);
			}
			window.location.href = `/s/${data.session_id}`;
		} catch (e: any) {
			errorMsg = e.message || '网络错误';
			loading = false;
		}
	}

	function resumeBySavedId() {
		if (savedId) window.location.href = `/s/${savedId}`;
	}
</script>

<div class="hero">
	<div class="quote">
		<p class="quote-text">
			没有人能快速且完整地介绍清楚<br />
			<span class="quote-em">自己是谁</span>、<span class="quote-em">自己的生意怎么做</span>、<span class="quote-em">自己的需求是什么</span>。
		</p>
	</div>

	<h1>🎯 所以你的品牌圣经还没写出来</h1>
	<p class="sub">
		和 AI 聊 15 分钟，答 200+ 道卡片选择题<br />
		最后给你一份专属品牌圣经（Markdown）
	</p>

	<div class="card">
		<label for="brand_name">给你的品牌起个名（可选）</label>
		<input
			id="brand_name"
			type="text"
			bind:value={brandName}
			placeholder="例如 MUSE Trendy Toy"
			disabled={loading}
		/>

		<button class="primary" onclick={startNew} disabled={loading}>
			{loading ? '准备中...' : '开始答题'}
		</button>

		{#if savedId}
			<button class="link" onclick={resumeBySavedId}>
				继续上次的（{savedId.slice(0, 8)}...）
			</button>
		{/if}

		{#if errorMsg}
			<div class="error">{errorMsg}</div>
		{/if}
	</div>

	<div class="footer">
		<p>
			这不是标准问卷。<br />
			每 4 题一轮，AI 根据你的上一轮答案动态生成下一轮。<br />
			4 大调研目标：
			<strong>我是谁 · 卖什么 · 怎么获客 · 怎么创作</strong>
		</p>
	</div>
</div>

<style>
	.hero {
		text-align: center;
		padding: 32px 20px;
	}
	.quote {
		background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
		color: #fafafa;
		padding: 36px 28px;
		border-radius: 20px;
		margin-bottom: 36px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
		position: relative;
		overflow: hidden;
	}
	.quote::before {
		content: '"';
		position: absolute;
		top: -20px;
		left: 20px;
		font-size: 120px;
		color: rgba(255, 255, 255, 0.08);
		font-family: Georgia, serif;
		font-weight: 700;
		line-height: 1;
	}
	.quote-text {
		font-size: 20px;
		font-weight: 500;
		line-height: 1.8;
		margin: 0;
		position: relative;
		z-index: 1;
	}
	.quote-em {
		color: #f5a623;
		font-weight: 700;
		border-bottom: 2px solid #f5a623;
		padding-bottom: 1px;
	}
	@media (max-width: 560px) {
		.quote {
			padding: 28px 20px;
		}
		.quote-text {
			font-size: 17px;
			line-height: 1.7;
		}
	}
	h1 {
		font-size: 24px;
		font-weight: 700;
		margin: 0 0 12px;
		line-height: 1.4;
	}
	.sub {
		color: #666;
		font-size: 16px;
		line-height: 1.6;
		margin: 0 0 40px;
	}
	.card {
		background: #fff;
		border-radius: 16px;
		padding: 32px 24px;
		box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
		text-align: left;
	}
	label {
		display: block;
		font-size: 14px;
		color: #555;
		margin-bottom: 8px;
	}
	input {
		width: 100%;
		font-size: 16px;
		padding: 12px 14px;
		border: 1px solid #e0e0e0;
		border-radius: 8px;
		margin-bottom: 16px;
		font-family: inherit;
	}
	input:focus {
		outline: none;
		border-color: #333;
	}
	.primary {
		width: 100%;
		font-size: 16px;
		font-weight: 600;
		padding: 14px;
		background: #1a1a1a;
		color: #fff;
		border: none;
		border-radius: 8px;
		cursor: pointer;
	}
	.primary:hover {
		opacity: 0.85;
	}
	.primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.link {
		width: 100%;
		background: none;
		border: none;
		color: #666;
		font-size: 14px;
		padding: 12px 0 0;
		cursor: pointer;
	}
	.link:hover {
		color: #333;
	}
	.error {
		color: #d00;
		font-size: 14px;
		margin-top: 12px;
		padding: 10px;
		background: #fff5f5;
		border-radius: 6px;
	}
	.footer {
		margin-top: 40px;
		color: #888;
		font-size: 13px;
		line-height: 1.8;
	}
	.footer strong {
		color: #333;
	}
</style>
