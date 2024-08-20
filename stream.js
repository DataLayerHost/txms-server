import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import txms from 'txms.js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const app = new Hono();
const port = process.env.PORT || 8080;
const logLevel = process.env.LOG_LEVEL || 'info';
const processMMS = process.env.MMS === 'true';
const bodyName = process.env.BODY_NAME || 'body';
const mediaName = process.env.MEDIA_NAME || 'mms';
const provider = (process.env.PROVIDER.endsWith('/') ? process.env.PROVIDER : `${process.env.PROVIDER}/`) + process.env.ENDPOINT;
const providerType = process.env.PROVIDER_TYPE || 'blockbook';
const rpcUrl = process.env.RPC_URL || 'http://localhost:8545';
const rpcMethod = process.env.RPC_METHOD || 'xcb_sendRawTransaction';

function log(level, message, data = null) {
	const levels = ['debug', 'info', 'warn', 'error'];
	const currentLevelIndex = levels.indexOf(logLevel);
	const messageLevelIndex = levels.indexOf(level);

	if (messageLevelIndex >= currentLevelIndex) {
		if (data) {
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
	return c.text('I\'m a cyber', 418);
});

app.get('/info', (c) => {
	const { name, version } = JSON.parse(readFileSync('./package.json', 'utf-8'));
	const info = `${name} v${version}`;
	log('debug', 'Application Info:', info);
	return c.text(info, 200);
});

app.get('/ping', (c) => {
	return c.text('OK', 200);
});

app.post('/', async (c) => {
	try {
		const data = await c.req.json();
		const messageBody = data[bodyName];
		const mediaUrls = data[mediaName];

		// Process SMS/MMS if body is present
		if (messageBody && messageBody.trim().length > 0) {
			log('debug', `Message body: "${messageBody}"`);
			const smsResult = await processSMS(messageBody);
			if (smsResult) return smsResult;
		}

		// Process MMS if enabled and attachments are present
		if (processMMS && mediaUrls && Array.isArray(mediaUrls)) {
			log('debug', `MMS URLs: "${mediaUrls}"`);
			const mmsResult = await processMMSMessages(mediaUrls);
			if (mmsResult) return mmsResult;
		}

		return c.text('No valid transactions processed', 422);
	} catch (err) {
		log('error', 'Request is not in JSON format.');
		return c.text('Invalid JSON', 400);
	}
});

function validateMessage(messageBody) {
	if (typeof messageBody !== 'string' || messageBody.trim().length === 0) {
		const error = 'Error: Empty message';
		log('debug', 'Error: Empty message');
		throw new Error(error);
	}
	return messageBody.split(/\u000a/u).map(msg => msg.trim());
}

function getHexTransaction(msg) {
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

async function processSMS(messageBody) {
	try {
		const parts = validateMessage(messageBody.trim());

		for (const msg of parts) {
			const hextx = getHexTransaction(msg);
			return await sendTransaction(hextx);
		}
	} catch (error) {
		log('debug', 'Error processing SMS:', error);
		return null;
	}
}

async function processMMSMessages(mediaUrls) {
	for (const url of mediaUrls) {
		if (url.endsWith('.txms')) {
			try {
				const response = await fetch(url);
				if (!response.ok) throw new Error(`Failed to fetch file from ${url}`);
				const fileContent = await response.text();

				const parts = validateMessage(fileContent.trim());
				for (const msg of parts) {
					const hextx = getHexTransaction(msg);
					const result = await sendTransaction(hextx);
					if (result) return result;
				}
			} catch (err) {
				log('debug', `Error processing MMS URL ${url}:`, err.message);
			}
		}
	}
	return null;
}

async function sendTransaction(hextx) {
	log('debug', `Sending to provider: ${provider}`);
	log('debug', `Transaction: ${hextx}`);
	if (providerType === 'blockbook') {
		log('debug', 'Transaction proceeding with Blockbook type.');
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

			const responseData = await response.json().catch(() => null);
			log('debug', `Provider Blockbook response data`, responseData);

			if (response.ok && responseData && responseData.result) {
				const ok = `OK TxID: ${responseData.result}`;
				log('debug', 'Transaction Successful', ok);
				return new Response(JSON.stringify({ message: ok, sent: true, date: timestamp() }), { status: 200, headers: { 'Content-Type': 'application/json' } });
			} else {
				const errorMessage = responseData?.error ? simplifyErrorMessage(responseData?.error) : 'Unknown error';
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
			const responseData = await response.json().catch(() => null);
			log('debug', `Provider RPC response data`, responseData);

			if (response.ok && responseData && responseData.result) {
				const ok = `OK TxID: ${responseData.result}`;
				log('debug', 'Transaction Successful', ok);
				return new Response(JSON.stringify({ message: ok, sent: true, date: timestamp() }), { status: 200, headers: { 'Content-Type': 'application/json' } });
			} else {
				const errorMessage = responseData?.error?.message ? simplifyErrorMessage(responseData?.error?.message) : 'Unknown error';
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

function simplifyErrorMessage(error) {
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
			return 'Insufficient funds for gas * price + value.';
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

function timestamp() {
	return new Date().toISOString();
}

serve({
	fetch: app.fetch,
	port: port
});

log('info', `Server is running on port: ${port}`);

// Handle graceful shutdown on SIGTERM
process.on('SIGTERM', () => {
	log('info', 'Server is shutting down...');
	process.exit(0);
});
