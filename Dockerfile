# Stage 1: Build TxMS Server using Node.js 20 LTS
FROM node:20-alpine AS build

# Set the working directory
WORKDIR /usr/src/app

# Copy the package.json (and package-lock.json) files
COPY package*.json ./

# Install dependencies
RUN npm install --only=production

# Copy the rest of the application files
COPY . .

# Stage 2: Final image with Caddy and TxMS Server
FROM caddy:alpine

# Install Node.js (Alpine version) in the Caddy image
RUN apk add --no-cache nodejs npm

# Copy the TxMS Server from the build stage
COPY --from=build /usr/src/app /usr/src/app

# Set the working directory
WORKDIR /usr/src/app

# Copy the Caddyfile configuration into the container
COPY Caddyfile /etc/caddy/Caddyfile

# Replace environment variables in the Caddyfile with sed
CMD sh -c "sed -i 's/\${DOMAIN_NAME}/$DOMAIN_NAME/g' /etc/caddy/Caddyfile && \
           sed -i 's/\${LETS_ENCRYPT_EMAIL}/$LETS_ENCRYPT_EMAIL/g' /etc/caddy/Caddyfile && \
           sed -i 's/\${LOG_LEVEL}/$LOG_LEVEL/g' /etc/caddy/Caddyfile && \
           node stream.js & \
           caddy run --config /etc/caddy/Caddyfile --adapter caddyfile"
