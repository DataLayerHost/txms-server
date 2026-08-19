import { expect, test } from 'bun:test';
import { detectTransactionReceipt, formatTokenAmount } from '../src/receipt.ts';

test('formats integer token units without floating-point loss', () => {
	expect(formatTokenAmount(1234500000000000000n, 18)).toBe('1.2345');
	expect(formatTokenAmount(1000000n, 6)).toBe('1');
});

test('detects a Well-Known CBC20 transfer ticker and amount', async () => {
	const contract = 'cb19c7acc4c292d2943ba23c2eaa5d9c5a6652a8710c';
	const transferInput = `0xa9059cbb${'0'.repeat(64)}${(1250000n).toString(16).padStart(64, '0')}`;
	const receipt = await detectTransactionReceipt('0xabc', {
		rpcUrl: 'https://rpc.example',
		attempts: 1,
		fetchImplementation: async (input) => {
			if (String(input) === 'https://rpc.example') {
				return Response.json({ result: { to: contract, value: '0x0', input: transferInput } });
			}
			return Response.json({ address: contract, ticker: 'USDX', decimals: 6 });
		},
	});
	expect(receipt).toEqual({ amount: '1.25', asset: 'USDX', direction: 'outgoing' });
});

test('detects native XCB amount', async () => {
	const receipt = await detectTransactionReceipt('0xabc', {
		rpcUrl: 'https://rpc.example',
		attempts: 1,
		fetchImplementation: async () => Response.json({
			result: { to: 'cb000000000000000000000000000000000000000000', value: '0xde0b6b3a7640000', input: '0x' },
		}),
	});
	expect(receipt).toEqual({ amount: '1', asset: 'XCB', direction: 'outgoing' });
});

test('uses the contract address when the token is not in Well-Known', async () => {
	const contract = 'cb1958b39698a44bdae37f881e68dce073823a48a631';
	const transferInput = `0xa9059cbb${'0'.repeat(64)}${(1250000n).toString(16).padStart(64, '0')}`;
	const receipt = await detectTransactionReceipt('0xabc', {
		rpcUrl: 'https://rpc.example',
		attempts: 1,
		fetchImplementation: async (input, init) => {
			if (String(input).includes('.well-known')) return new Response(null, { status: 404 });
			const request = JSON.parse(String(init?.body)) as { method: string };
			if (request.method === 'xcb_call') return Response.json({ result: '0x6' });
			return Response.json({ result: { to: contract, value: '0x0', input: transferInput } });
		},
	});
	expect(receipt).toEqual({
		amount: '1.25',
		asset: contract.toUpperCase(),
		direction: 'outgoing',
	});
});
