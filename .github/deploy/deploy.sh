#!/usr/bin/env bash
set -Eeuo pipefail

stage_dir=$(pwd -P)
deploy_path=$(<deploy-path)
project_name=$(<project-name)

case "$stage_dir" in
	/tmp/txms-deploy.*) ;;
	*)
		echo "Refusing unexpected deployment staging directory: $stage_dir" >&2
		exit 1
		;;
esac

cleanup() {
	find "$stage_dir" -mindepth 1 -delete 2>/dev/null || true
	rmdir "$stage_dir" 2>/dev/null || true
}
trap cleanup EXIT

command -v docker >/dev/null 2>&1 || {
	echo "Docker is not installed or is not available in PATH" >&2
	exit 1
}
docker compose version >/dev/null 2>&1 || {
	echo "The Docker Compose plugin is not installed or unavailable" >&2
	exit 1
}
docker info >/dev/null 2>&1 || {
	echo "The deploy user cannot access the Docker daemon; configure Docker access without sudo" >&2
	exit 1
}

home_path=$(cd "$HOME" && pwd -P)
case "$deploy_path" in
	/*)
		case "$deploy_path" in
			/srv/txms-server | /srv/txms-server/* | /opt/txms-server | /opt/txms-server/*) ;;
			*)
				echo "Absolute DEPLOY_PATH must be under /srv/txms-server or /opt/txms-server" >&2
				exit 1
				;;
		esac
		;;
	*)
		deploy_path="$home_path/$deploy_path"
		;;
esac

mkdir -p "$deploy_path"
resolved_deploy_path=$(cd "$deploy_path" && pwd -P)
case "$deploy_path" in
	"$home_path"/*)
		case "$resolved_deploy_path" in
			"$home_path"/*) ;;
			*)
				echo "Relative DEPLOY_PATH resolves outside the deploy user's home directory" >&2
				exit 1
				;;
		esac
		;;
	/srv/txms-server | /srv/txms-server/*)
		case "$resolved_deploy_path" in
			/srv/txms-server | /srv/txms-server/*) ;;
			*)
				echo "DEPLOY_PATH resolves outside /srv/txms-server" >&2
				exit 1
				;;
		esac
		;;
	/opt/txms-server | /opt/txms-server/*)
		case "$resolved_deploy_path" in
			/opt/txms-server | /opt/txms-server/*) ;;
			*)
				echo "DEPLOY_PATH resolves outside /opt/txms-server" >&2
				exit 1
				;;
		esac
		;;
esac

install -m 600 compose.yml "$resolved_deploy_path/compose.yml.new"
install -m 600 .compose.env "$resolved_deploy_path/.compose.env.new"
install -m 600 .runtime.env "$resolved_deploy_path/.runtime.env.new"
mv -f "$resolved_deploy_path/compose.yml.new" "$resolved_deploy_path/compose.yml"
mv -f "$resolved_deploy_path/.compose.env.new" "$resolved_deploy_path/.compose.env"
mv -f "$resolved_deploy_path/.runtime.env.new" "$resolved_deploy_path/.runtime.env"
cd "$resolved_deploy_path"

compose=(docker compose --project-name "$project_name" --env-file .compose.env -f compose.yml)
diagnostics() {
	"${compose[@]}" ps --all || true
	"${compose[@]}" logs --no-color --tail 100 txms-server || true
}

if ! "${compose[@]}" config --quiet; then
	echo "Docker Compose configuration validation failed" >&2
	diagnostics
	exit 1
fi
if ! "${compose[@]}" pull txms-server; then
	echo "Docker image pull failed" >&2
	diagnostics
	exit 1
fi
if ! "${compose[@]}" up -d --remove-orphans txms-server; then
	echo "Docker Compose deployment failed" >&2
	diagnostics
	exit 1
fi

"${compose[@]}" ps --all
