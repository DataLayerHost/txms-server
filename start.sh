#!/bin/sh

# Replace environment variables in traefik.yml.template and output to traefik.yml
envsubst < /etc/traefik/traefik.yml.template > /etc/traefik/traefik.yml

# Replace environment variables in dynamic.yml.template and output to dynamic.yml
envsubst < /etc/traefik/dynamic.yml.template > /etc/traefik/dynamic.yml

# Start Node.js and Traefik
node /usr/src/app/stream.js &

# Start Traefik
traefik
