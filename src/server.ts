import app from './app.ts';

const port = Number(Bun.env.PORT || 8080);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535');

const server = Bun.serve({ fetch: app.fetch, port });
console.log(`[info] Server is running on port: ${server.port}`);

process.on('SIGTERM', () => {
	console.log('[info] Server is shutting down...');
	void server.stop();
});
