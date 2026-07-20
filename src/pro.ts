const PHONE_NUMBER_MAX_DIGITS = 15;
const DEFAULT_TIMEOUT_MS = 5000;
const PRO_SERVICE = 'txms';
const UNIVERSAL_PRO_SERVICE = 'all';

type ProErrorStatus = 400 | 502 | 503;
type Environment = Record<string, string | undefined>;

interface LookupOptions {
	env?: Environment;
	fetchImplementation?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
	now?: Date;
}

export type ProStatus = { pro: false } | { pro: true; level: number };

export class ProLookupError extends Error {
	readonly status: ProErrorStatus;

	constructor(message: string, status: ProErrorStatus) {
		super(message);
		this.name = 'ProLookupError';
		this.status = status;
	}
}

export function normalizePhoneNumber(value: unknown): string {
	if (typeof value !== 'string' && typeof value !== 'number') {
		throw new ProLookupError('number must be a string or number', 400);
	}
	if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) {
		throw new ProLookupError('number must be a non-negative safe integer', 400);
	}
	const number = String(value).replace(/\D/gu, '');
	if (!number || number.length > PHONE_NUMBER_MAX_DIGITS) {
		throw new ProLookupError(`Phone number must contain 1 to ${PHONE_NUMBER_MAX_DIGITS} digits`, 400);
	}
	return number;
}

function getSupabaseConfiguration(env: Environment): { url: string; secretKey: string } {
	const url = env.SUPABASE_URL?.replace(/\/+$/u, '');
	const secretKey = env.SUPABASE_SECRET_KEY;
	if (!url || !secretKey) throw new ProLookupError('Pro service is not configured', 503);
	try {
		const parsedUrl = new URL(url);
		if (parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== '127.0.0.1' && parsedUrl.hostname !== 'localhost') throw new Error();
	} catch {
		throw new ProLookupError('Pro service configuration is invalid', 503);
	}
	return { url, secretKey };
}

export async function lookupPro(number: string, options: LookupOptions = {}): Promise<ProStatus> {
	const { env = Bun.env, fetchImplementation = fetch, now = new Date() } = options;
	const { url, secretKey } = getSupabaseConfiguration(env);
	const timeout = Number(env.SUPABASE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
	if (!Number.isSafeInteger(timeout) || timeout < 100 || timeout > 30000) {
		throw new ProLookupError('Pro service timeout configuration is invalid', 503);
	}
	const endpoint = new URL(`${url}/rest/v1/pro_accounts`);
	endpoint.searchParams.set('select', 'service,pro_level');
	endpoint.searchParams.set('service', `in.(${PRO_SERVICE},${UNIVERSAL_PRO_SERVICE})`);
	endpoint.searchParams.set('number', `eq.${number}`);
	endpoint.searchParams.set('suspended', 'is.false');
	endpoint.searchParams.set('activation', `lte.${now.toISOString()}`);
	endpoint.searchParams.set('expiration', `gt.${now.toISOString()}`);
	endpoint.searchParams.set('order', 'service.desc');
	endpoint.searchParams.set('limit', '1');

	let response: Response;
	try {
		response = await fetchImplementation(endpoint, {
			headers: { Accept: 'application/json', apikey: secretKey },
			signal: AbortSignal.timeout(timeout),
		});
	} catch {
		throw new ProLookupError('Pro service is temporarily unavailable', 503);
	}
	if (!response.ok) throw new ProLookupError('Pro service returned an error', 502);

	let rows: unknown;
	try {
		rows = await response.json();
	} catch {
		throw new ProLookupError('Pro service returned an invalid response', 502);
	}
	if (!Array.isArray(rows) || rows.length > 1) throw new ProLookupError('Pro service returned an invalid response', 502);
	if (rows.length === 0) return { pro: false };
	const level = (rows[0] as Record<string, unknown>).pro_level;
	if (!Number.isSafeInteger(level) || (level as number) < 1) throw new ProLookupError('Pro service returned an invalid level', 502);
	return { pro: true, level: level as number };
}

export async function checkProRequest(body: unknown, options: LookupOptions = {}): Promise<ProStatus> {
	if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.hasOwn(body, 'number')) {
		throw new ProLookupError('Request content must contain number', 400);
	}
	const number = (body as Record<string, unknown>).number;
	return lookupPro(normalizePhoneNumber(number), options);
}
