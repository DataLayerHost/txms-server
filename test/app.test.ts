import { expect, test } from 'bun:test';
import app, { failedMessage } from '../src/app';

test('failed transaction messages include the reason and fit in one SMS', () => {
	expect(failedMessage('Nonce too low.')).toBe('Failed: Nonce too low.');

	const message = failedMessage('x'.repeat(200));
	expect(message).toHaveLength(160);
	expect(message).toBe(`Failed: ${'x'.repeat(152)}`);
});

for (const method of ['QUERY', 'POST']) {
	test(`${method} /pro uses the Pro JSON handler`, async () => {
		const response = await app.request('/pro', { method });
		expect(response.status).toBe(400);
		expect(response.headers.get('Accept-Query')).toBe('"application/json"');
		expect(await response.json()).toMatchObject({ message: 'Content-Type is required' });
	});
}
