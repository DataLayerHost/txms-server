#!/usr/bin/env bash
set -Eeuo pipefail

image_name=$1
container_name=$2

current_image_id=$(docker inspect "$container_name" --format '{{.Image}}')
while read -r image_reference image_id; do
	if [[ -n "$image_reference" && "$image_id" != "$current_image_id" ]]; then
		docker image rm "$image_reference" || true
	fi
done < <(docker image ls --no-trunc --filter "reference=$image_name:*" --format '{{.Repository}}:{{.Tag}} {{.ID}}')
