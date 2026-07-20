import { expect, test } from 'bun:test';
import { checkProRequest, lookupPro, normalizePhoneNumber } from '../src/pro';

const env = {
	SUPABASE_URL: 'https://example.supabase.co',
	SUPABASE_SECRET_KEY: 'test-secret',
};

test('normalizes a formatted phone number to digits', () => {
	expect(normalizePhoneNumber('+421 (900) 123-456')).toBe('421900123456');
});

test('rejects an empty normalized phone number', () => {
	expect(() => normalizePhoneNumber('+() -')).toThrow();
});

test('returns active Pro level from Supabase', async () => {
	let requestedUrl: URL | undefined;
	const result = await lookupPro('421900123456', {
		env,
		now: new Date('2026-07-20T12:00:00.000Z'),
		fetchImplementation: async (input) => {
			requestedUrl = input as URL;
			return new Response(JSON.stringify([{ service: 'txms', pro_level: 3 }]), { status: 200 });
		},
	});
	expect(result).toEqual({ pro: true, level: 3 });
	expect(requestedUrl?.searchParams.get('service')).toBe('in.(txms,all)');
	expect(requestedUrl?.searchParams.get('order')).toBe('service.desc');
	expect(requestedUrl?.searchParams.get('number')).toBe('eq.421900123456');
	expect(requestedUrl?.searchParams.get('activation')).toBe('lte.2026-07-20T12:00:00.000Z');
	expect(requestedUrl?.searchParams.get('expiration')).toBe('gt.2026-07-20T12:00:00.000Z');
	expect(requestedUrl?.searchParams.get('suspended')).toBe('is.false');
});

test('returns false when account is absent, inactive, expired, or suspended', async () => {
	const result = await checkProRequest({ number: '+421 900 123 456' }, {
		env,
		fetchImplementation: async () => new Response('[]', { status: 200 }),
	});
	expect(result).toEqual({ pro: false });
});

test('requires a flat number value', async () => {
	await expect(checkProRequest({ number: {} }, { env })).rejects.toMatchObject({ status: 400 });
	await expect(checkProRequest({ value: '+421 900 123 456' }, { env })).rejects.toMatchObject({ status: 400 });
});

test('returns a non-200 error for missing configuration', async () => {
	await expect(lookupPro('421900123456', { env: {} })).rejects.toMatchObject({ status: 503 });
});

test('returns a non-200 error for Supabase failures', async () => {
	await expect(
		lookupPro('421900123456', {
			env,
			fetchImplementation: async () => new Response('{}', { status: 500 }),
		}),
	).rejects.toMatchObject({ status: 502 });
});
