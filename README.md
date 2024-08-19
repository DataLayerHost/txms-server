# TxMS Server

Utilize this server to develop your unique TxMS webhook, securely deployed with Caddy and Let's Encrypt powered by Hono API.

## Services

This server provides the following services:

- Catch the SMS and forward it to the blockchain provider.
- Catch the MMS attachments `.txms`, fetch them and forward it to the blockchain provider.
- Accepting TxMS Binary-to-text transcription and pure hexadecimal data.
- `0x` prefix is optional for hexadecimal data.

## Installation

### Requirements

- **Node.js**: Version 20 or above.
- **Docker**: Ensure Docker (and Docker Compose) are installed.

### Setting Up Environment Variables

Create a `.env` file or use Docker Compose to set environment variables.

The necessary environment variables are:

- **LETS_ENCRYPT_EMAIL**: The email address for Let's Encrypt registration.
- **DOMAIN_NAME**: The domain name for which the SSL certificate will be issued.
- **PROVIDER**: The URL of the blockchain provider (e.g., Blockbook).
- **ENDPOINT**: The specific endpoint for streaming Core Transactions. For Blockbook, ending with a `/` is mandatory!
- **LOG_LEVEL**: The logging level (e.g., `info`, `debug`, `warn`, `error`).
- **MMS**: Set to `true` to enable MMS support; otherwise `false`.
- **PORT**: The port on which the server will run.
- **BODY_NAME**: The name of the body parameter in the request. Default is `body`.
- **MEDIA_NAME**: The name of the MMS media parameter in the request. Default is `mms`.

### Docker Deployment

This project includes a Docker setup using Caddy as a reverse proxy and Let's Encrypt for HTTPS.

```bash
sudo docker run -d \
  -e LETS_ENCRYPT_EMAIL=txms@onion.email \
  -e DOMAIN_NAME=main-ep1.txms.info \
  -e MMS=false \
  -e PORT=8080 \
  -e PROVIDER=https://blockindex.net \
  -e ENDPOINT=api/v2/sendtx/ \
  -e LOG_LEVEL=info \
  -p 80:80 \
  -p 443:443 \
  -v $(pwd)/caddy_data:/data/caddy \
  -v $(pwd)/caddy_config:/config/caddy \
  --name txms-main-server \
  ghcr.io/datalayerhost/txms-server:{version}
```

Note: Customize your setup and replace `{version}` with the latest release version.

### Docker Compose Example

Create a `docker-compose.yml` file in the project root:

```yaml
version: '3.9'

services:
  txms-server:
    image: ghcr.io/datalayerhost/txms-server:latest
    container_name: txms-server
    restart: always
    environment:
      - LETS_ENCRYPT_EMAIL=user@onion.email
      - DOMAIN_NAME=main-ep1.domain.lol
      - MMS=false
      - PORT=8080
      - PROVIDER=https://blockindex.net
      - ENDPOINT=api/v2/sendtx/
      - LOG_LEVEL=info
    ports:
      - "443:443"
      - "80:80"
    volumes:
      - ./caddy_data:/data/caddy
      - ./caddy_config:/config/caddy
```

Replace the placeholders with your actual values:

- `user@onion.email`: Your email for Let's Encrypt.
- `main-ep1.domain.lol`: The domain name for which the SSL certificate is issued.
- `https://blockindex.net`: The URL of your blockchain provider.
- `api/v2/sendtx/`: The endpoint for streaming transactions. For Blockbook, ending with a `/` is mandatory!

## Building and Pushing Docker Image

To automate the Docker image build and push process upon creating a release, GitHub Actions is configured.

The workflow file `.github/workflows/release-docker-image.yml` handles:

- Checking out the code.
- Building the Docker image using Node.js 20 LTS and Caddy.
- Pushing the Docker image to GitHub's Docker registry.

## Firewall Rules

Ensure the following ports are open:

- **80**: HTTP port for Caddy.
- **443**: HTTPS port for Caddy.

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw reload
```

Enable and test the firewall:

```bash
sudo ufw enable
sudo ufw status
```

## Endpoints

- **GET `/`**: I'm a teapot (and I'm a cyber).
- **POST `/`**: Stream - Handles incoming transaction messages and forwards them to Blockbook.
- **GET `/info`**: Info - Returns the application name and version.
- **GET `/ping`**: Ping - A simple health check endpoint.

## Connectors

The server is designed to connect with the following blockchain providers:

- Blockbook: A blockchain indexer supporting Core, Bitcoin, and other cryptocurrencies.
- SMS and MMS receiving services (e.g., Twilio, Nexmo, Plivo) [Charges may apply].

Blockbook can be substituted by connecting directly to a Blockchain node. However, streaming transactions is only possible after the node is fully synchronized, which significantly increases the server's resource requirements. To avoid this, we opted to use external services. If you require a node-based solution, please consider contributing to the project or reaching out to us directly.

## Free and Paid Plans

This service is 100% free for everyone and lifetime.

However you can decide to make it as a paid service, you can do it by:

- Charging for the SMS and MMS receiving services.
- Charging for the blockchain transactions.
- Introduce credit system for the users.
- Introduce subscription plans.
- Introduce a freemium model.

To do so, you can modify the code and create database of numbers, which paid for the service. We will be happy to help you with that or you can contribute to the codebase.

## SMS and MMS

The server can handle both SMS and MMS messages. To enable MMS, set the `MMS` environment variable to `true`.

MMS messages can contain `.txms` attachments, which are fetched and forwarded to the blockchain provider.

Pricing for SMS and MMS services may vary depending on the provider. Please check with your provider for more information.

## Contributing

We welcome contributions from the community. To contribute, please follow these steps:

1. Fork the repository.
2. Create a new branch.
3. Make your changes.
4. Commit your changes.
5. Push your changes to your fork.
6. Create a pull request.

Please ensure your code is well-documented and follows the project's coding standards.

Respect the license and do not close the code from public (there is no need for it).

## License

This project is licensed under the [CORE License](LICENSE).
