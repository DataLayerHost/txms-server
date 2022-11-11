# TXMS server

You can deploy this server to create your own TXMS webhook.

## Installation

Node.js 14 or newer is expected.

### Creation of environment variables

To start development version create `.env` file in the root of the project.

Contents of `.env` file:

```sh
DEBUG=…
PROVIDER=…
ENDPOINT=…
```

Where:
- DEBUG: Debugging of the program - 1/true / 0/false
- PROVIDER: Url of the provider used (Currently [Blockbook](https://github.com/cryptohub-digital/blockbook) supported.)
- ENDPOINT: Endpoint for streaming the Core Transactions

### Installation of dependencies

To install the dependencies, run the command:

`npm i`

## Development

To run the development version, run command:

`npm run start`

## Deployment

To deploy your project on the server, make sure you have correct rights and then follow:

1. Git clone the repository
1. Install dependencies
1. Setup your environment variables
1. Setup [PM2](https://pm2.keymetrics.io/) daemon process manager

Example of the process:

`pm2 start stream.js`

## Endpoints

- GET `/`: I'm a teapot (and I'm crypto positive)
- POST `/`: Stream
- GET `/info`: Info
- GET `/ping`: Ping

## Expected stream

We have expectations to get Json stream, for example:

```json
{
  "from": "+123456789",
  "body": "Hello world"
}
```

## Epigram

> 「Cryptoni Confidimus」

## License

Licensed under the [CORE License](LICENSE).
