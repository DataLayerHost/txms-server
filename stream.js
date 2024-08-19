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
		const error = 'Err(1): Empty message';
		const emptyError = { "id": null, "message": error, "sent": false, "error": "Empty message", "errno": 1, "date": timestamp() };
		log('debug', 'Err(1)', emptyError);
		throw new Error(emptyError.message);
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
			return await sendTransaction(provider, hextx);
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
					const result = await sendTransaction(provider, hextx);
					if (result) return result;
				}
			} catch (err) {
				log('debug', `Error processing MMS URL ${url}:`, err.message);
			}
		}
	}
	return null;
}

async function sendTransaction(provider, hextx) {
	try {
		log('debug', `Sending to provider: ${provider}`);
		log('debug', `Transaction: ${hextx}`);
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
		log('debug', `Provider response data`, responseData);

		if (response.ok && responseData && responseData.result) {
			const ok = `OK: <${hextx.substring(2, 8)}${hextx.slice(-6)}> ${responseData.result} TxID: ${responseData.result}`;
			const oks = { "message": ok, "sent": true, "hash": responseData.result, "date": timestamp() };
			log('debug', 'Transaction Successful', oks);
			return new Response(JSON.stringify(oks), { status: 200, headers: { 'Content-Type': 'application/json' } });
		} else {
			const errorMessage = responseData?.error?.message || 'Unknown error';
			const nok = `Err(2): <${hextx.substring(2, 8)}${hextx.slice(-6)}> Msg: ${errorMessage}`;
			const noks = { "message": nok, "sent": false, "error": errorMessage, "date": timestamp() };
			log('debug', 'Transaction Failed', noks);
			return new Response(JSON.stringify(noks), { status: 400, headers: { 'Content-Type': 'application/json' } });
		}
	} catch (err) {
		const error = `Err(3): <${hextx.substring(2, 8)}${hextx.slice(-6)}>`;
		const errors = {
			"message": error,
			"sent": false,
			"error": err?.message || 'Unknown error',
			"errno": 3,
			"date": timestamp(),
			"statusCode": err?.response?.status || 'N/A',
		};
		log('error', 'Transaction Processing Error', errors);
		return new Response(JSON.stringify(errors), { status: 500, headers: { 'Content-Type': 'application/json' } });
	}
}

function timestamp() {
	return new Date().toISOString();
}

function getAddressFromTx(hex) {
	const address = hex.slice(27, 71).toLowerCase();
	log('debug', `Address: ${address}`);
	return address;
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
