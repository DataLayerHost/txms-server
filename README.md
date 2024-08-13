# TxMS Server

Utilize this server to develop your unique TxMS webhook, securely deployed with Traefik and Let's Encrypt powered by Hono API.

## Installation

### Requirements

- **Node.js**: Version 18 or above (20 LTS recommended).
- **Docker**: Ensure Docker and Docker Compose are installed.

### Setting Up Environment Variables

Create a `.env` file or use Docker Compose to set environment variables.

The necessary environment variables are:

- **LETS_ENCRYPT_EMAIL**: The email address for Let's Encrypt registration.
- **DOMAIN_NAME**: The domain name for which the SSL certificate will be issued.
- **DEBUG**: Set to `1` or `true` for debugging; otherwise `0` or `false`.
- **PROVIDER**: The URL of the blockchain provider (e.g., Blockbook).
- **ENDPOINT**: The specific endpoint for streaming Core Transactions.

### Docker Deployment

This project includes a Docker setup using Traefik as a reverse proxy and Let's Encrypt for HTTPS.

```bash
sudo docker run -d \
  -e LETS_ENCRYPT_EMAIL=user@onion.email \
  -e DOMAIN_NAME=main-ep1.domain.lol \
  -e DEBUG=0 \
  -e PROVIDER=https://blockindex.net \
  -e ENDPOINT=api/v2/sendtx \
  -p 443:443 \
  --name txms-main-server \
  docker pull ghcr.io/datalayerhost/txms-server:latest
```

#### Docker Compose Example

Create a `docker-compose.yml` file in the project root:

```yaml
version: '3.7'

services:
  txms-server:
    image: ghcr.io/datalayerhost/txms-server:latest
    container_name: txms-server
    restart: always
    environment:
      - LETS_ENCRYPT_EMAIL=user@onion.email
      - DOMAIN_NAME=main-ep1.domain.lol
      - DEBUG=1
      - PROVIDER=https://blockindex.net
      - ENDPOINT=api/v2/sendtx
    ports:
      - "443:443"
    volumes:
      - ./acme.json:/etc/traefik/acme.json
```

Replace the placeholders with your actual values:

- `user@onion.email`: Your email for Let's Encrypt.
- `main-ep1.domain.lol`: The domain name for which the SSL certificate is issued.
- `https://blockindex.net`: The URL of your blockchain provider.
- `api/v2/sendtx`: The endpoint for streaming transactions.

### Building and Pushing Docker Image

To automate the Docker image build and push process upon creating a release, GitHub Actions is configured.

The workflow file `.github/workflows/release-docker-image.yml` handles:

- Checking out the code.
- Building the Docker image using Node.js 20 LTS and Traefik.
- Pushing the Docker image to GitHub's Docker registry.

### Endpoints

- **GET `/`**: I'm a teapot (and I'm a cyber).
- **POST `/`**: Stream - Handles incoming transaction messages and forwards them to Blockbook.
- **GET `/info`**: Info - Returns the application name and version.
- **GET `/ping`**: Ping - A simple health check endpoint.

### License

This project is licensed under the [CORE License](LICENSE).
