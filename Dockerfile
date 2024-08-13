# Stage 1: Build TxMS Server using Node.js 20 LTS
FROM node:20-alpine AS build

# Set the working directory
WORKDIR /usr/src/app

# Copy the package.json and package-lock.json files
COPY package*.json ./

# Install dependencies
RUN npm install --only=production

# Copy the rest of the application files
COPY . .

# Stage 2: Final image with Traefik and TxMS Server
FROM traefik:v2.5

# Copy the TxMS Server from the build stage
COPY --from=build /usr/src/app /usr/src/app

# Set the working directory
WORKDIR /usr/src/app

# Copy Traefik configuration files
COPY traefik.yml /etc/traefik/traefik.yml
COPY dynamic.yml /etc/traefik/dynamic.yml

# Expose only the secured port
EXPOSE 443

# Start both Traefik and the TxMS Server
CMD ["sh", "-c", "node stream.js & traefik"]
