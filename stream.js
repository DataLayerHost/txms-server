import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import txms from 'txms.js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const app = new Hono();
const port = process.env.PORT || 8080;
const debug = process.env.DEBUG === 'true';
const processMMS = process.env.MMS === 'true';
const bodyName = process.env.BODY_NAME || 'body';
const mediaName = process.env.MEDIA_NAME || 'mms';
const provider = (process.env.PROVIDER.endsWith('/') ? process.env.PROVIDER : `${process.env.PROVIDER}/`) + process.env.ENDPOINT;

app.get('/', (c) => {
	return c.text('I\'m a cyber', 418);
});

app.get('/info', (c) => {
	const { name, version } = JSON.parse(readFileSync('./package.json', 'utf-8'));
	const info = `${name} v${version}`;
	if (debug) console.info('Info: ', info);
	return c.text(info, 200);
});

app.get('/ping', (c) => {
	return c.text('OK', 200);
});

app.post('/', async (c) => {
	const data = await c.req.json();
	const messageBody = data[bodyName];
	const mediaUrls = data[mediaName];

	// Process SMS/MMS if body is present
	if (messageBody && messageBody.trim().length > 0) {
		if (debug) console.log('Info', `Message body: "${messageBody}"`);
		const smsResult = await processSMS(messageBody);
		if (smsResult) return smsResult;
	}

	// Process MMS if enabled and attachments are present
	if (processMMS && mediaUrls && Array.isArray(mediaUrls)) {
		if (debug) console.log('Info', `MMS URLs: "${mediaUrls}"`);
		const mmsResult = await processMMSMessages(mediaUrls);
		if (mmsResult) return mmsResult;
	}

	return c.text('No valid transactions processed', 422);
});

function validateMessage(messageBody) {
	if (typeof messageBody !== 'string' || messageBody.trim().length === 0) {
		const error = 'Err(1): Empty message';
		const emptyError = { "id": null, "message": error, "sent": false, "error": "Empty message", "errno": 1, "date": timestamp() };
		if (debug) console.error('Err(1)', emptyError);
		throw new Error(emptyError.message);
	}
	return messageBody.split(/\u000a/u).map(msg => msg.trim());
}

function getHexTransaction(msg) {
	const hextest = /^(0[xX])?[0-9a-fA-F]+$/;
	let hextx = '';
	if (hextest.test(msg)) {
		hextx = msg.toLowerCase().startsWith('0x') ? msg : `0x${msg}`;
		if (debug) console.log('Info', `HEX message: ${hextx}`);
	} else if (msg.length !== 0) {
		hextx = txms.decode(msg);
		if (debug) console.log('Info', `TxMS message: ${hextx}`);
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
				if (debug) console.error(`Error processing MMS URL ${url}: ${err.message}`);
			}
		}
	}
	return null;
}

async function sendTransaction(provider, hextx) {
	try {
		const response = await fetch(provider, {
			method: 'POST',
			headers: {
				'Content-Type': 'text/plain',
				'User-Agent': 'txms-server',
			},
			body: hextx,
		});

		const responseData = await response.json();

		if (response.ok && responseData.result) {
			const ok = `OK: <${hextx.substring(2, 6)}${hextx.slice(-4)}> ${responseData.result} TxID: ${responseData.result}`;
			const oks = { "message": ok, "sent": true, "hash": responseData.result, "date": timestamp() };
			if (debug) console.log('OK', oks);
			return new Response(JSON.stringify(oks), { status: 200, headers: { 'Content-Type': 'application/json' } });
		} else {
			const nok = `Err(2): <${hextx.substring(2, 6)}${hextx.slice(-4)}> Msg: ${responseData.error.message}`;
			const noks = { "message": err, "sent": false, "error": responseData.error.message, "date": timestamp() };
			if (debug) console.log('NOK', noks);
			return new Response(JSON.stringify(noks), { status: 400, headers: { 'Content-Type': 'application/json' } });
		}
	} catch (err) {
		const error = `Err(3): <${hextx.substring(2, 6)}${hextx.slice(-4)}>`;
		const errors = {
			"message": error,
			"sent": false,
			"error": err.message,
			"errno": 3,
			"date": timestamp(),
			"statusCode": err.response?.status,
		};
		console.error('Err(3)', errors);
		return new Response(JSON.stringify(errors), { status: 500, headers: { 'Content-Type': 'application/json' } });
	}
}

function timestamp() {
	return new Date().toISOString();
}

serve({
	fetch: app.fetch,
	port: port
});

console.log(`Server is running on port: ${port}`);
