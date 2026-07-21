import { expect, test } from 'bun:test';
import app from '../src/app';

for (const method of ['QUERY', 'POST']) {
	test(`${method} /pro uses the Pro JSON handler`, async () => {
		const response = await app.request('/pro', { method });
		expect(response.status).toBe(400);
		expect(response.headers.get('Accept-Query')).toBe('"application/json"');
		expect(await response.json()).toMatchObject({ message: 'Content-Type is required' });
	});
}
