# TxMS Server

Utilize this server to develop your unique TxMS webhook, securely deployed with Caddy and Let's Encrypt powered by Hono API.

## Services

This server provides the following services:

- Catch the SMS and forward it to the blockchain provider.
- Catch the MMS attachments (content type: `text/plain`), fetch them and forward it to the blockchain provider. Ideally set extension as `.txms.txt`.
- Accepting TxMS Binary-to-text transcription and pure hexadecimal data.
- `0x` prefix is optional for hexadecimal data.

## Installation

### Requirements

- **Bun**: Version 1.3.14 or above.
- **Docker**: Ensure Docker (and Docker Compose - if needed) are installed.

### Setting Up Environment Variables

Create a `.env` file or use Docker Compose to set environment variables.

The necessary environment variables are:

- **LETS_ENCRYPT_EMAIL**: The email address for Let's Encrypt registration.
- **DOMAIN_NAME**: The domain name for which the SSL certificate will be issued.
- **PROVIDER**: The URL of a Blockbook provider. Required only when `PROVIDER_TYPE=blockbook`.
- **ENDPOINT**: The Blockbook transaction endpoint. Required only when `PROVIDER_TYPE=blockbook`.
- **LOG_LEVEL**: The logging level (e.g., `info`, `debug`, `warn`, `error`).
- **MMS**: Set to `true` to enable MMS support; otherwise `false`.
- **PORT**: The port on which the server will run.
- **BODY_NAME**: The name of the body parameter in the request. Default is `body`.
- **MEDIA_NAME**: The name of the MMS media Urls array parameter in the request. Default is `mediaUrls`.
- **MEDIA_TYPE_NAME**: The name of the MMS media content type array parameter in the request. Default is `mediaContentTypes`.
- **PROVIDER_TYPE**: Transaction submission type. Defaults to `rpc`; set it to `blockbook` to use the legacy web-provider path.
- **RPC_URL**: The Core JSON-RPC endpoint. Defaults to `http://localhost:8545`.
- **RPC_METHOD**: The RPC method to call. Required if `PROVIDER_TYPE` is `rpc`. Default is `xcb_sendRawTransaction`.
- **SUPABASE_URL**: Supabase project URL used by `QUERY /pro`.
- **SUPABASE_SECRET_KEY**: Backend-only Supabase secret key used by `QUERY /pro`.
- **SUPABASE_TIMEOUT_MS**: Optional Supabase timeout in milliseconds. Defaults to `5000`.

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

We are providing customized Docker images for the server. You can use the following images:

- Dockerfile: main Docker image with Bun and Caddy to be connected with the blockchain provider.
- Dockerfile.core: Docker image to be connected with the Core Blockchain using RPC.

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
- Installing dependencies, type-checking, testing, and building with Bun before creating images.
- Building the Docker image using Bun 1.3.14 and Caddy.
- Pushing the Docker image to GitHub's Docker registry.
- Publishing the standard image as `{version}`/`latest` and the bundled gocore image as `{version}-core`/`core-latest`.

After publishing the image, the release workflow invokes `.github/workflows/deploy.yml` sequentially for four GitHub Environments. Create environments named `testnet-backup`, `testnet-primary`, `mainnet-backup`, and `mainnet-primary`. Configure the following secrets separately in each environment:

- `SSH_HOST`: Production server hostname or IP address.
- `SSH_USER`: SSH account used for deployment.
- `SSH_PRIVATE_KEY`: Private key accepted by the production server.
- `SSH_PORT`: Optional SSH port; defaults to `22`.
- `SSH_KNOWN_HOSTS`: Pinned SSH host-key line for the production server.
- `RPC_URL`: Optional secret alternative to the `RPC_URL` variable when the URL contains credentials.

Configure these GitHub Actions variables separately in each environment:

- `DOMAIN_NAME`: Public TxMS hostname, such as `txms.example.com`.
- `LETS_ENCRYPT_EMAIL`: Email used for Caddy certificate management. This can be configured once as a repository variable or overridden per environment.
- `DEPLOY_PATH`: Server deployment directory. Defaults to `~/txms-server` and is created automatically. Relative paths remain inside the SSH user's home; explicit absolute paths must be under `/srv/txms-server` or `/opt/txms-server`.
- `HEALTHCHECK_URL`: Optional public health URL, such as `https://txms.example.com/ping`.
- `RPC_URL`: Optional hosted Core JSON-RPC URL, such as `https://rpc.example.com`. The bundled Core image defaults to its local node when this is unset.
- `RPC_METHOD`: Optional submission method; defaults to `xcb_sendRawTransaction`.
- `LOG_LEVEL`: Optional application and Caddy log level. It accepts `debug`, `info`, `warn`, `warning`, or `error`, case-insensitively, and defaults to `info`.
- `SUPABASE_TIMEOUT_MS`: Optional Pro lookup timeout; defaults to `5000` milliseconds.

Configure the two Supabase projects once at repository level under **Settings → Secrets and variables → Actions**:

- Repository secrets: `SUPABASE_TESTNET_URL`, `SUPABASE_TESTNET_SECRET_KEY`, `SUPABASE_MAINNET_URL`, and `SUPABASE_MAINNET_SECRET_KEY`.

The deployment workflow selects the testnet project for `CORE_NETWORK=devin` and the mainnet project for `CORE_NETWORK=mainnet`. Only the selected credentials are written to each server.

The workflow securely stages `compose.yml`, a Compose interpolation file, and a protected runtime environment file, then atomically installs them with mode `600`. SSH requires the pinned host key and uses non-interactive, single-identity connections. No manual Compose setup or GHCR login is required because the image is public. The remote user must have passwordless access to Docker without `sudo` and must have the Docker Compose plugin installed. Deployment order is testnet backup, testnet primary, mainnet backup, then mainnet primary. Each server must pass its HTTPS health check before the next deployment starts. Testnet runs gocore with the `devin` network and mainnet uses `mainnet`. Automatic deployment uses the bundled Core image and defaults to its local JSON-RPC endpoint at `http://127.0.0.1:8545`. Setting `RPC_URL` switches a server to a hosted RPC domain. After each new release passes its health check, superseded TxMS images are removed. Active images, named volumes, Core chain data, Caddy certificates, and unrelated images are preserved.

Deployed containers are named `txms-testnet-backup`, `txms-testnet-primary`, `txms-mainnet-backup`, and `txms-mainnet-primary` according to their target GitHub Environment.

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

- **GET `/`**: Service status and current server time.
- **POST `/`**: Handles incoming transaction messages and submits them through the configured RPC or Blockbook provider.
- **QUERY `/pro`**: Normalize a phone number and check active Pro status in the network-specific Supabase project.
- **GET `/info`**: Info - Returns the application name and version.
- **GET `/ping`**: Ping - A simple health check endpoint.

### Pro status

Request:

```http
QUERY /pro HTTP/1.1
Content-Type: application/json

{"number":"+421 900-123-456"}
```

Formatting is removed before lookup, producing `421900123456`. The endpoint follows RFC 10008 media-type requirements, advertises `Accept-Query: "application/json"`, and sends `Cache-Control: no-store`. An account is active only when it exists, is not suspended, its activation time has arrived, and its expiration time has not passed.

Active response:

```json
{
  "pro": true,
  "level": 1
}
```

Missing or inactive response:

```json
{
  "pro": false
}
```

Input errors, missing configuration, connection failures, and invalid Supabase responses return a non-200 status.

Apply `supabase/migrations/20260720000000_create_pro_accounts.sql` independently to the testnet and mainnet Supabase projects using `supabase db push`. Pro lookups accept rows whose `service` is `txms` or `all`; an explicit `txms` row takes priority when both exist. The column defaults to `txms`. The migration enables Row Level Security, denies public table access, and schedules daily deletion of expired accounts through `pg_cron`.

## Connectors

The server is designed to connect with the following blockchain providers:

- Blockchcain:
  - Blockbook: A blockchain indexer supporting Core, Bitcoin, and other cryptocurrencies.
  - JSON-RPC: A generic connector for any blockchain supporting JSON-RPC.
- SMS and MMS receiving services (e.g., Twilio, Nexmo, Plivo) [Charges may apply].

Blockbook can be substituted by connecting directly to a Blockchain node. However, streaming transactions is only possible after the node is fully synchronized, which significantly increases the server's resource requirements. To avoid this, we opted to use external services. If you require a node-based solution, please consider using RPC connector.

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

MMS messages can contain attachments (content type: `text/plain`), which are fetched and forwarded to the blockchain provider. Ideally set extension as `.txms.txt`. You can generate them using the [TxMS Encoder](https://github.com/bchainhub/txms.js) and function `downloadMessage`.

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

Respect the license and do not close the code for public (there is no need for it).

## License

This project is licensed under the [CORE License](LICENSE).
