FROM oven/bun:1.3.14-alpine AS dependencies

WORKDIR /usr/src/app

COPY package.json ./
RUN bun install --production --no-save

FROM oven/bun:1.3.14-alpine

USER root
RUN apk add --no-cache caddy

WORKDIR /usr/src/app

ENV PORT=8080 \
	PROVIDER_TYPE=rpc \
	RPC_URL=http://127.0.0.1:8545 \
	RPC_METHOD=xcb_sendRawTransaction \
	XDG_CONFIG_HOME=/config \
	XDG_DATA_HOME=/data

COPY --from=dependencies /usr/src/app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 80 443

VOLUME ["/data", "/config"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
	CMD wget --quiet --spider http://127.0.0.1:8080/ping || exit 1

STOPSIGNAL SIGTERM

CMD ["sh", "-c", "trap 'kill -TERM $bun_pid $caddy_pid 2>/dev/null; wait' TERM INT; bun run src/server.ts & bun_pid=$!; caddy run --config /etc/caddy/Caddyfile --adapter caddyfile & caddy_pid=$!; wait -n $bun_pid $caddy_pid; status=$?; kill -TERM $bun_pid $caddy_pid 2>/dev/null; wait; exit $status"]
