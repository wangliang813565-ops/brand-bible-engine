<script lang="ts">
	let { children } = $props();
</script>

<svelte:head>
	<title>品牌圣经 · AI 调研员</title>
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<meta
		name="description"
		content="和 AI 聊 15 分钟，200 题卡片选择题定义你的品牌圣经"
	/>
</svelte:head>

<main>
	{@render children()}
</main>

<style>
	:global(html, body) {
		margin: 0;
		padding: 0;
		font-family:
			-apple-system,
			BlinkMacSystemFont,
			'PingFang SC',
			'Helvetica Neue',
			Helvetica,
			Arial,
			sans-serif;
		background: #fafafa;
		color: #1a1a1a;
		min-height: 100vh;
	}
	:global(*) {
		box-sizing: border-box;
	}
	main {
		max-width: 720px;
		margin: 0 auto;
		padding: 24px 16px 80px;
	}
</style>
