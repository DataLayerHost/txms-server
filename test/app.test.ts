import { expect, test } from 'bun:test';
import app, { failedMessage, successMessage } from '../src/app';

test('failed transaction messages include the reason and fit in one SMS', () => {
	expect(failedMessage('Nonce too low.')).toBe('Failed: Nonce too low.');

	const message = failedMessage('x'.repeat(200));
	expect(message).toHaveLength(160);
	expect(message).toBe(`Failed: ${'x'.repeat(152)}`);
});

test('successful transaction messages include amount and asset when available', () => {
	expect(successMessage('0xabc123', {
		amount: '12.5',
		asset: 'CTN',
		direction: 'outgoing',
	})).toBe('OK -12.5 CTN TxID: 0xabc123');
	expect(successMessage('abc123', {
		amount: '1.25',
		asset: 'USDX',
		direction: 'incoming',
	})).toBe('OK +1.25 USDX TxID: 0xabc123');
});

test('successful transaction messages preserve complete identifiers within one SMS', () => {
	const txid = `0x${'a'.repeat(64)}`;
	const contract = 'CB1958B39698A44BDAE37F881E68DCE073823A48A631';
	const message = successMessage(txid, {
		amount: '1.25',
		asset: contract,
		direction: 'outgoing',
	});
	expect(message).toBe(`OK -1.25 ${contract} TxID: ${txid}`);
	expect(message.length).toBeLessThanOrEqual(160);
});

test('successful transaction messages reject data that cannot fit without truncation', () => {
	expect(() => successMessage(`0x${'a'.repeat(64)}`, {
		amount: '1',
		asset: 'X'.repeat(150),
		direction: 'outgoing',
	})).toThrow(RangeError);
});

for (const method of ['QUERY', 'POST']) {
	test(`${method} /pro uses the Pro JSON handler`, async () => {
		const response = await app.request('/pro', { method });
		expect(response.status).toBe(400);
		expect(response.headers.get('Accept-Query')).toBe('"application/json"');
		expect(await response.json()).toMatchObject({ message: 'Content-Type is required' });
	});
}
