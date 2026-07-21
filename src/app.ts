import { Hono } from 'hono';
import txms from 'txms.js';
import packageInfo from '../package.json' with { type: 'json' };
import { checkProRequest, ProLookupError } from './pro.ts';

const app = new Hono();
const configuredLogLevel = process.env.LOG_LEVEL;
const processMMS = process.env.MMS === 'true';
const bodyName = process.env.BODY_NAME || 'body';
const mediaName = process.env.MEDIA_NAME || 'mediaUrls';
const mediaTypeName = process.env.MEDIA_TYPE_NAME || 'mediaContentTypes';
const providerType = process.env.PROVIDER_TYPE || 'rpc';
const providerUrl = process.env.PROVIDER || '';
const provider = providerUrl ? (providerUrl.endsWith('/') ? providerUrl : `${providerUrl}/`) + (process.env.ENDPOINT || '') : '';
const rpcUrl = process.env.RPC_URL || 'http://localhost:8545';
const rpcMethod = process.env.RPC_METHOD || 'xcb_sendRawTransaction';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type JsonRecord = Record<string, unknown>;
const logLevel: LogLevel = configuredLogLevel === 'debug' || configuredLogLevel === 'warn' || configuredLogLevel === 'error'
	? configuredLogLevel
	: 'info';

function log(level: LogLevel, message: string, data?: unknown): void {
	const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
	const currentLevelIndex = levels.indexOf(logLevel);
	const messageLevelIndex = levels.indexOf(level);

	if (messageLevelIndex >= currentLevelIndex) {
		if (data !== undefined) {
			if (level === 'error') {
				console.error(`[${level}] ${message}`, data);
			} else {
				console.log(`[${level}] ${message}`, data);
			}
		} else {
			if (level === 'error') {
				console.error(`[${level}] ${message}`);
			} else {
				console.log(`[${level}] ${message}`);
			}
		}
	}
}

app.get('/', (c) => {
	return c.json({ service: 'ok', time: timestamp() }, 200);
});

app.get('/info', (c) => {
	const info = `${packageInfo.name} v${packageInfo.version}`;
	log('debug', 'Application Info:', info);
	return c.text(info, 200);
});

app.get('/ping', (c) => {
	return c.text('OK', 200);
});

app.on(['QUERY', 'POST'], '/pro', async (c) => {
	c.header('Cache-Control', 'no-store');
	c.header('Accept-Query', '"application/json"');
	const contentType = c.req.header('Content-Type');
	if (!contentType) {
		return c.json({ message: 'Content-Type is required', date: timestamp() }, 400);
	}
	if (contentType.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
		return c.json({ message: 'Content-Type must be application/json', date: timestamp() }, 415);
	}
	try {
		const result = await checkProRequest(await c.req.json());
		return c.json(result, 200);
	} catch (error) {
		if (error instanceof ProLookupError) {
			return c.json({ message: error.message, date: timestamp() }, error.status);
		}
		if (error instanceof SyntaxError) {
			return c.json({ message: 'Invalid JSON', date: timestamp() }, 400);
		}
		log('error', 'Unexpected Pro service error', error);
		return c.json({ message: 'Internal server error', date: timestamp() }, 500);
	}
});

app.post('/', async (c) => {
	try {
		const data = await c.req.json<JsonRecord>();
		const messageBody = data[bodyName];
		const mediaUrls = data[mediaName];
		const mediaContentTypes = data[mediaTypeName];

		// Process SMS/MMS if body is present
		if (typeof messageBody === 'string' && messageBody.trim().length > 0) {
			log('debug', `Message body: "${messageBody}"`);
			const smsResult = await processSMS(messageBody);
			if (smsResult) return smsResult;
		}

		// Process MMS if enabled and attachments are present
		if (processMMS && mediaUrls && Array.isArray(mediaUrls) && mediaUrls.length > 0 && mediaContentTypes && Array.isArray(mediaContentTypes) && mediaContentTypes.length > 0) {
			log('debug', `MMS URLs: "${mediaUrls}"`);
			const mmsResult = await processMMSMessages(mediaUrls, mediaContentTypes);
			if (mmsResult) return mmsResult;
		}

		return c.json({ message: 'No valid transactions processed', sent: false, date: timestamp() }, 422);
	} catch (err) {
		log('error', 'Request is not in JSON format.');
		return c.json({ message: 'Invalid JSON', sent: false, date: timestamp() }, 400);
	}
});

function validateMessage(messageBody: string): string[] {
	if (typeof messageBody !== 'string' || messageBody.trim().length === 0) {
		const error = 'Error: Empty message';
		log('debug', 'Error: Empty message');
		throw new Error(error);
	}
	return messageBody.split(/\u000a/u).map(msg => msg.trim());
}

function getHexTransaction(msg: string): string {
	const hextest = /^(0[xX])?[0-9a-fA-F]+$/;
	let hextx = '';
	if (hextest.test(msg)) {
		hextx = msg.toLowerCase().startsWith('0x') ? msg : `0x${msg}`;
		log('debug', `HEX message: ${hextx}`);
	} else if (msg.length !== 0) {
		hextx = txms.decode(msg);
		log('debug', `TxMS message to HEX: ${hextx}`);
	}
	return hextx;
}

async function processSMS(messageBody: string): Promise<Response | null> {
	try {
		const parts = validateMessage(messageBody.trim());

		for (const msg of parts) {
			const hextx = getHexTransaction(msg);
			if (hextx) {
				return await sendTransaction(hextx);
			}
		}
		return null;
	} catch (error) {
		log('debug', 'Error processing SMS:', error);
		return null;
	}
}

async function processMMSMessages(mediaUrls: unknown[], mediaContentTypes: unknown[]): Promise<Response | null> {
	for (let i = 0; i < mediaUrls.length; i++) {
		const url = mediaUrls[i];
		const contentType = mediaContentTypes[i];

		if (typeof url !== 'string' || contentType !== 'text/plain') {
			log('debug', `Skipping non-text content type: ${contentType}`);
			continue;
		}

		try {
			const response = await fetch(url);
			if (!response.ok) throw new Error(`Failed to fetch file from ${url}`);
			const fileContent = await response.text();

			const parts = validateMessage(fileContent.trim());
			for (const msg of parts) {
				const hextx = getHexTransaction(msg);
				if (hextx) {
					const result = await sendTransaction(hextx);
					if (result) return result;
				}
			}
		} catch (err) {
			log('debug', `Error processing MMS URL ${url}:`, err instanceof Error ? err.message : err);
		}
	}
	return null;
}

async function sendTransaction(hextx: string): Promise<Response> {
	log('debug', `Sending to provider: ${provider}`);
	log('debug', `Transaction: ${hextx}`);
	if (providerType === 'blockbook') {
		log('debug', 'Transaction proceeding with Blockbook type.');
		if (!provider) {
			const error = 'Error: PROVIDER is required for Blockbook mode.';
			log('error', 'Missing Blockbook provider', error);
			return new Response(JSON.stringify({ message: error, sent: false, date: timestamp() }), { status: 500, headers: { 'Content-Type': 'application/json' } });
		}
		try {
			const response = await fetch(provider, {
				method: 'POST',
				headers: {
					'Content-Type': 'text/plain',
					'User-Agent': 'txms-server',
				},
				body: hextx,
			});
			log('debug', `Provider response`, response);

			const responseData = await response.json().catch(() => null) as JsonRecord | null;
			log('debug', `Provider Blockbook response data`, responseData);

			if (response.ok && responseData && typeof responseData.result === 'string') {
				const txid = responseData.result;
				const ok = `OK TxID: ${txid}`;
				log('debug', 'Transaction Successful', ok);
				return new Response(JSON.stringify({ message: ok, sent: true, txid, date: timestamp() }), { status: 200, headers: { 'Content-Type': 'application/json' } });
			} else {
				const errorMessage = responseData?.error ? simplifyErrorMessage(String(responseData.error)) : 'Unknown error';
				log('debug', 'Transaction Failed', errorMessage);
				return new Response(JSON.stringify({ message: errorMessage, sent: false, date: timestamp() }), { status: 400, headers: { 'Content-Type': 'application/json' } });
			}
		} catch (err) {
			const error = `Error: Unable to process transaction.`;
			log('error', 'Transaction Processing Error', err);
			return new Response(JSON.stringify({ message: error, sent: false, date: timestamp() }), { status: 500, headers: { 'Content-Type': 'application/json' } });
		}
	} else if (providerType === 'rpc') {
		log('debug', 'Transaction proceeding with RPC type.');
		try {
			// Prepare the JSON-RPC request
			const requestData = {
				jsonrpc: '2.0',
				method: rpcMethod,
				params: [hextx],
				id: 1,
			};

			// Send the transaction to the client
			const response = await fetch(rpcUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(requestData),
			});

			// Parse the JSON response
			const responseData = await response.json().catch(() => null) as JsonRecord | null;
			log('debug', `Provider RPC response data`, responseData);

			if (response.ok && responseData && typeof responseData.result === 'string') {
				const txid = responseData.result;
				const ok = `OK TxID: ${txid}`;
				log('debug', 'Transaction Successful', ok);
				return new Response(JSON.stringify({ message: ok, sent: true, txid, date: timestamp() }), { status: 200, headers: { 'Content-Type': 'application/json' } });
			} else {
				const rpcError = responseData?.error;
				const errorMessage = rpcError && typeof rpcError === 'object' && 'message' in rpcError
					? simplifyErrorMessage(String(rpcError.message))
					: 'Unknown error';
				log('debug', 'Transaction Failed', errorMessage);
				return new Response(JSON.stringify({ message: errorMessage, sent: false, date: timestamp() }), { status: 400, headers: { 'Content-Type': 'application/json' } });
			}
		} catch (err) {
			const error = `Error: Unable to process transaction.`;
			log('error', 'Transaction Processing Error', err);
			return new Response(JSON.stringify({ message: error, sent: false, date: timestamp() }), { status: 500, headers: { 'Content-Type': 'application/json' } });
		}
	} else {
		const error = `Error: Unknown provider type: ${providerType}`;
		log('error', 'Unknown provider type', error);
		return new Response(JSON.stringify({ message: error, sent: false, date: timestamp() }), { status: 500, headers: { 'Content-Type': 'application/json' } });
	}
}

function simplifyErrorMessage(error: string): string {
	switch (error) {
		case "invalid argument 0: json: cannot unmarshal hex string without 0x prefix into Go value of type hexutil.Bytes":
			return 'Invalid format: Missing 0x prefix.';
		case "invalid argument 0: json: cannot unmarshal hex string of odd length into Go value of type hexutil.Bytes":
			return 'Invalid format: Hex string has odd length.';
		case "rlp: value size exceeds available input length":
			return 'Transaction data too large.';
		case "invalid signature":
			return 'Invalid signature.';
		case "invalid recipient":
			return 'Invalid recipient address.';
		case "invalid signature or recipient":
			return 'Invalid signature or recipient.';
		case "invalid argument 0: json: cannot unmarshal invalid hex string into Go value of type hexutil.Bytes":
			return 'Invalid format: Invalid hex string.';
		case "transaction underpriced":
			return 'Transaction underpriced.';
		case "nonce too low":
			return 'Nonce too low.';
		case "nonce too high":
			return 'Nonce too high.';
		case "insufficient funds for energy * price + value":
		case "insufficient funds for gas * price + value":
			return 'Insufficient funds for transaction and fees.';
		case "intrinsic energy too low":
		case "intrinsic gas too low":
			return 'Fee limit too low.';
		case "known transaction":
		case "already known":
			return 'Transaction already known.';
		case "replacement transaction underpriced":
			return 'Replacement transaction underpriced.';
		default:
			return error;
	}
}

function timestamp(): string {
	return new Date().toISOString();
}

export default app;
