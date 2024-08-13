import 'dotenv/config';
import { Hono } from 'hono';
import { json } from 'hono/json';
import txms from 'txms.js';

const app = new Hono();

app.use('*', json());

app.get('/', (c) => {
	return c.text('I\'m a cyber', 418);
});

app.get('/info', (c) => {
	const info = `${process.env.npm_package_name} v${process.env.npm_package_version}`;
	return c.text(info, 200);
});

app.get('/ping', (c) => {
	return c.text('OK', 200);
});

app.post('/', async (c) => {
	const debug = (process.env.DEBUG == 1 || process.env.DEBUG === 'true');

	const body = await c.req.json();
	const messageBody = body.body;
	const number = body.from;

	if (typeof messageBody === 'string' && messageBody.trim().length === 0) {
		let error = 'Err(1): Empty message';
		let emptyError = { "id": null, "message": error, "sent": false, "error": "Empty message", "errno": 1, "date": timestamp() };
		if (debug) console.error('Err(1)', emptyError);
		return c.json(emptyError, 422);
	}

	const provider = (process.env.PROVIDER.endsWith('/') ? process.env.PROVIDER : `${process.env.PROVIDER}/`) + process.env.ENDPOINT;

	const parts = messageBody.split(/\u000a/u);

	for (const msg of parts) {
		let rawmsg = msg.trim();
		const hextest = /^(0[xX])?[0-9a-fA-F]+$/;
		let hextx = '';
		if (hextest.test(rawmsg)) {
			hextx = rawmsg.toLowerCase().startsWith('0x') ? rawmsg : `0x${rawmsg}`;
			if (debug) console.log('Info', `HEX message: ${hextx}`);
		} else if (typeof rawmsg === 'string' && rawmsg.length !== 0) {
			hextx = txms.decode(rawmsg);
			if (debug) console.log('Info', `TxMS message: ${hextx}`);
		} else {
			let error = 'Err(2): Empty message part';
			let perror = { "id": null, "message": error, "sent": false, "error": "Empty message part", "errno": 2, "date": timestamp() };
			if (debug) console.error('Err(2)', perror);
			return c.json(perror, 422);
		}

		try {
			const response = await fetch(provider, {
				method: 'POST',
				headers: {
					'Content-Type': 'text/plain',
					'User-Agent': 'txms',
				},
				body: hextx,
			});

			const responseData = await response.json();

			if (response.ok && responseData.result) {
				let ok = `OK: <${hextx.substring(2, 5)}${hextx.slice(-3)}> ${responseData.result}`;
				let oks = { "message": ok, "sent": true, "hash": responseData.result, "date": timestamp() };
				if (debug) console.log('OK', oks);
				return c.json(oks, 200);
			} else {
				let ok = `OK: <${hextx.substring(2, 5)}${hextx.slice(-3)}>`;
				let oks = { "message": ok, "sent": true, "date": timestamp() };
				if (debug) console.log('OK', oks);
				return c.json(oks, 200);
			}
		} catch (err) {
			let error = `Err(3): <${hextx.substring(2, 5)}${hextx.slice(-3)}>`;
			let errors = {
				"message": error,
				"sent": false,
				"error": err.message,
				"errno": 3,
				"date": timestamp(),
				"statusCode": err.response?.status,
			};
			if (debug) console.error('Err(3)', errors);

			return c.json(errors, 500);
		}
	}
});

function timestamp() {
	return new Date().toISOString();
}

const port = 8080;
app.listen(port, () => console.log(`App running on port ${port}`));
