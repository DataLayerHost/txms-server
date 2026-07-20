#!/bin/sh
set -eu

case "${CORE_NETWORK:-mainnet}" in
	mainnet)
		network_flag=''
		;;
	devin)
		network_flag='--devin'
		;;
	*)
		echo "CORE_NETWORK must be mainnet or devin" >&2
		exit 1
		;;
esac

gocore_pid=''
bun_pid=''
caddy_pid=''

shutdown() {
	for pid in "$gocore_pid" "$bun_pid" "$caddy_pid"; do
		[ -z "$pid" ] || kill -TERM "$pid" 2>/dev/null || true
	done
	wait || true
}

trap shutdown TERM INT

# network_flag is either empty or the validated GoCore --devin switch.
# shellcheck disable=SC2086
gocore $network_flag \
	--http \
	--http.addr 127.0.0.1 \
	--http.port "$CORE_HTTP_PORT" \
	--http.api xcb,net,web3 \
	--datadir "$CORE_DATA_DIR" &
gocore_pid=$!

bun run src/server.ts &
bun_pid=$!

caddy run --config /etc/caddy/Caddyfile --adapter caddyfile &
caddy_pid=$!

set +e
# Alpine BusyBox supports wait -n although it is not specified by POSIX sh.
# shellcheck disable=SC3045
wait -n "$gocore_pid" "$bun_pid" "$caddy_pid"
status=$?
set -e
shutdown
exit "$status"
