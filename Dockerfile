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

# Stage 2: Final image with Traefik and TxMS Server
FROM traefik:3.1

# Install Node.js (Alpine version) and envsubst in the Traefik image
RUN apk add --no-cache nodejs npm

# Copy the TxMS Server from the build stage
COPY --from=build /usr/src/app /usr/src/app

# Set the working directory
WORKDIR /usr/src/app

# Copy the configuration files into the container
COPY dynamic.yml /etc/traefik/dynamic.yml
COPY traefik.yml /etc/traefik/traefik.yml

# Use envsubst to replace environment variables in place at runtime
CMD sh -c "sed -i 's/\${DOMAIN_NAME}/$DOMAIN_NAME/g' /etc/traefik/dynamic.yml && \
           sed -i 's/\${LETS_ENCRYPT_EMAIL}/$LETS_ENCRYPT_EMAIL/g' /etc/traefik/traefik.yml && \
           node stream.js & \
           traefik --configFile=/etc/traefik/traefik.yml"
