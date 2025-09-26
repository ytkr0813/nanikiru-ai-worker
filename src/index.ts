/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

interface Env {
	OPENAI_API_KEY: string;
	ADVICE_API_KEY: string;
}

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

const SYSTEM_PROMPT = `麻雀の「何切る」アドバイザーとして、プレイヤーの手牌とドラの情報から最適な選択をアドバイスしてください。
以下の点に注意してアドバイスを提供してください：
あなたは麻雀漫画のキャラクターでヤクザの代打ちとして生計を立てている裏世界のプロです。そういう人物になりきってクールにアドバイスしてください。
1. どの牌を切るべきか具体的に指摘すること
2. 他家の聴牌気配は無視すること
3. なぜその牌を切るべきか、簡潔な理由を説明すること
4. 回答は120文字程度に収めること`;

const ALLOWED_ORIGINS = ['app://nanikiru'];
const buildCorsHeaders = (request: Request) => {
	const origin = request.headers.get('Origin');
	const allowOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : 'null';
	return {
		'Access-Control-Allow-Origin': allowOrigin,
		'Access-Control-Allow-Methods': 'POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, X-Advice-Api-Key',
	};
};

type AdviceRequest = {
	hand: unknown;
	doras: unknown;
	temperature?: number;
};

export default {
	async fetch(request, env): Promise<Response> {
		const corsHeaders = buildCorsHeaders(request);

		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders });
		}

		if (request.method !== 'POST') {
			return new Response('Method Not Allowed', {
				status: 405,
				headers: corsHeaders,
			});
		}

		if (!env.OPENAI_API_KEY || !env.ADVICE_API_KEY) {
			return new Response('Server misconfigured', {
				status: 500,
				headers: corsHeaders,
			});
		}

		const providedKey = request.headers.get('X-Advice-Api-Key');
		if (!providedKey || providedKey !== env.ADVICE_API_KEY) {
			return new Response('Unauthorized', {
				status: 401,
				headers: corsHeaders,
			});
		}

		let payload: AdviceRequest;
		try {
			payload = (await request.json()) as AdviceRequest;
		} catch (error) {
			return new Response('Invalid JSON body', {
				status: 400,
				headers: corsHeaders,
			});
		}

		if (!Array.isArray(payload.hand) || !Array.isArray(payload.doras)) {
			return new Response('`hand` and `doras` must be arrays', {
				status: 400,
				headers: corsHeaders,
			});
		}

		const body = JSON.stringify({
			model: 'gpt-4o',
			messages: [
				{ role: 'system', content: SYSTEM_PROMPT },
				{
					role: 'user',
					content: `以下の手牌とドラ情報から、どの牌を切るべきかアドバイスしてください：\n手牌: ${JSON.stringify(payload.hand, null, 2)}\nドラ: ${JSON.stringify(payload.doras, null, 2)}`,
				},
			],
			temperature: typeof payload.temperature === 'number' ? payload.temperature : 0.7,
			max_tokens: 200,
		});

		const openAiResponse = await fetch(OPENAI_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${env.OPENAI_API_KEY}`,
			},
			body,
		});

		const responseBody = await openAiResponse.text();
		return new Response(responseBody, {
			status: openAiResponse.status,
			headers: {
				...corsHeaders,
				'Content-Type': 'application/json',
			},
		});
	},
} satisfies ExportedHandler<Env>;
