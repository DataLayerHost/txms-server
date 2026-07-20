#!/usr/bin/env bash
set -Eeuo pipefail

deploy_path=$1
project_name=$2

case "$deploy_path" in
	/*) ;;
	*) deploy_path="$HOME/$deploy_path" ;;
esac

if [[ ! -d "$deploy_path" ]]; then
	echo "Deployment directory does not exist: $deploy_path" >&2
	exit 1
fi

cd "$deploy_path"
docker compose --project-name "$project_name" --env-file .compose.env -f compose.yml ps --all || true
docker compose --project-name "$project_name" --env-file .compose.env -f compose.yml logs --no-color --tail 100 txms-server || true
