const DEFAULT_WELL_KNOWN_URL = 'https://coreblockchain.net/.well-known/tokens';
const TRANSFER_SELECTOR = 'a9059cbb';
const TRANSFER_FROM_SELECTOR = '23b872dd';

type JsonRecord = Record<string, unknown>;
type FetchImplementation = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface TransactionReceiptAsset {
	amount: string;
	asset: string;
	direction: 'incoming' | 'outgoing';
}

interface ReceiptOptions {
	rpcUrl: string;
	network?: string;
	wellKnownUrl?: string;
	fetchImplementation?: FetchImplementation;
	attempts?: number;
	retryDelayMs?: number;
}

function asRecord(value: unknown): JsonRecord | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? value as JsonRecord
		: null;
}

function parseHexQuantity(value: unknown): bigint | null {
	if (typeof value !== 'string' || !/^0x[0-9a-f]+$/iu.test(value)) return null;
	try {
		return BigInt(value);
	} catch {
		return null;
	}
}

export function formatTokenAmount(value: bigint, decimals: number): string {
	if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 255) {
		throw new RangeError('Invalid token decimals');
	}
	if (decimals === 0) return value.toString();
	const padded = value.toString().padStart(decimals + 1, '0');
	const whole = padded.slice(0, -decimals);
	const fraction = padded.slice(-decimals).replace(/0+$/u, '');
	return fraction ? `${whole}.${fraction}` : whole;
}

function tokenAmount(input: string): bigint | null {
	const data = input.toLowerCase().replace(/^0x/u, '');
	let amountOffset: number;
	if (data.startsWith(TRANSFER_SELECTOR)) {
		amountOffset = 8 + 64;
	} else if (data.startsWith(TRANSFER_FROM_SELECTOR)) {
		amountOffset = 8 + 128;
	} else {
		return null;
	}
	const amount = data.slice(amountOffset, amountOffset + 64);
	if (amount.length !== 64 || !/^[0-9a-f]+$/u.test(amount)) return null;
	return BigInt(`0x${amount}`);
}

async function loadWellKnownToken(
	contract: string,
	network: string,
	wellKnownUrl: string,
	fetchImplementation: FetchImplementation,
): Promise<{ ticker: string; decimals: number } | null> {
	if (!/^[a-z]{2}[0-9a-f]{42}$/u.test(contract)) return null;
	let response: Response;
	try {
		response = await fetchImplementation(
			`${wellKnownUrl.replace(/\/+$/u, '')}/${encodeURIComponent(network)}/${encodeURIComponent(contract)}.json`,
			{ headers: { Accept: 'application/json', 'User-Agent': 'txms-server' } },
		);
	} catch {
		return null;
	}
	if (!response.ok) return null;
	const body = asRecord(await response.json().catch(() => null));
	if (!body || String(body.address ?? '').toLowerCase() !== contract) return null;
	const ticker = typeof body.ticker === 'string' ? body.ticker.trim().toUpperCase() : '';
	const decimals = typeof body.decimals === 'number' ? body.decimals : Number(body.decimals);
	if (!/^[A-Z0-9._-]{1,16}$/u.test(ticker) || !Number.isSafeInteger(decimals) || decimals < 0 || decimals > 255) {
		return null;
	}
	return { ticker, decimals };
}

async function loadTokenDecimals(
	contract: string,
	rpcUrl: string,
	fetchImplementation: FetchImplementation,
): Promise<number | null> {
	const response = await fetchImplementation(rpcUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'User-Agent': 'txms-server' },
		body: JSON.stringify({
			jsonrpc: '2.0',
			method: 'xcb_call',
			params: [{ to: contract, data: '0x313ce567' }, 'latest'],
			id: 3,
		}),
	});
	if (!response.ok) return null;
	const payload = asRecord(await response.json().catch(() => null));
	const value = parseHexQuantity(payload?.result);
	if (value == null || value > 255n) return null;
	return Number(value);
}

async function loadTransaction(
	txid: string,
	rpcUrl: string,
	fetchImplementation: FetchImplementation,
): Promise<JsonRecord | null> {
	const response = await fetchImplementation(rpcUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'User-Agent': 'txms-server' },
		body: JSON.stringify({
			jsonrpc: '2.0',
			method: 'xcb_getTransactionByHash',
			params: [txid],
			id: 2,
		}),
	});
	if (!response.ok) return null;
	const payload = asRecord(await response.json().catch(() => null));
	return asRecord(payload?.result);
}

export async function detectTransactionReceipt(
	txid: string,
	options: ReceiptOptions,
): Promise<TransactionReceiptAsset | null> {
	const fetchImplementation = options.fetchImplementation ?? fetch;
	const attempts = options.attempts ?? 3;
	const retryDelayMs = options.retryDelayMs ?? 250;
	let transaction: JsonRecord | null = null;
	for (let attempt = 0; attempt < attempts; attempt++) {
		transaction = await loadTransaction(txid, options.rpcUrl, fetchImplementation);
		if (transaction) break;
		if (attempt + 1 < attempts) await Bun.sleep(retryDelayMs);
	}
	if (!transaction) return null;

	const input = typeof transaction.input === 'string'
		? transaction.input
		: typeof transaction.data === 'string'
			? transaction.data
			: '0x';
	const transferredTokenAmount = tokenAmount(input);
	if (transferredTokenAmount != null && typeof transaction.to === 'string') {
		const contract = transaction.to.trim().toLowerCase();
		const token = await loadWellKnownToken(
			contract,
			(options.network ?? 'xcb').toLowerCase(),
			options.wellKnownUrl ?? DEFAULT_WELL_KNOWN_URL,
			fetchImplementation,
		);
		const decimals = token?.decimals ?? await loadTokenDecimals(
			contract,
			options.rpcUrl,
			fetchImplementation,
		);
		if (decimals == null) return null;
		return {
			amount: formatTokenAmount(transferredTokenAmount, decimals),
			asset: token?.ticker ?? contract.toUpperCase(),
			direction: 'outgoing',
		};
	}

	const value = parseHexQuantity(transaction.value);
	if (value == null) return null;
	if (value === 0n && input.replace(/^0x/u, '').length > 0) return null;
	return {
		amount: formatTokenAmount(value, 18),
		asset: 'XCB',
		direction: 'outgoing',
	};
}
