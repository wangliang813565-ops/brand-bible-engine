// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Platform {
			env: {
				DB: D1Database;
				GEMINI_API_KEY: string;
				FEISHU_APP_ID?: string;
				FEISHU_APP_SECRET?: string;
				FEISHU_BITABLE_APP_TOKEN?: string;
				FEISHU_BITABLE_TABLE_ID?: string;
			};
			context: {
				waitUntil(promise: Promise<any>): void;
			};
			caches: CacheStorage & { default: Cache };
		}
	}
}

export {};
