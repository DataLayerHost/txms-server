# TxMS Server

Utilize this server to develop your unique TxMS webhook.

## Installation

Ensure you have Node.js version 14 or above.

### Setting Up Environment Variables

For the development version, construct a `.env` file in the project root directory.

The contents of the `.env` file should include:

```sh
DEBUG=…
PROVIDER=…
ENDPOINT=…
```

Definitions:
- DEBUG: Toggles program debugging - 1/true or 0/false
- PROVIDER: URL of the utilized provider (Currently, only [Blockbook](https://github.com/trezor/blockbook) is supported.)
- ENDPOINT: Endpoint for streaming Core Transactions

### Installing Dependencies

Run the following command to install necessary dependencies:

`npm i`

## Development

To operate the development version, execute this command:

`npm run start`

## Deployment

For server deployment of your project, ascertain appropriate permissions before adhering to these steps:

1. Clone the Git repository
1. Install dependencies
1. Configure your environment variables
1. Establish the [PM2](https://pm2.keymetrics.io/) daemon process manager

An illustration of the process is as follows:

`pm2 start stream.js`

## Endpoints

- GET `/`: I'm a teapot (and I'm crypto positive)
- POST `/`: Stream
- GET `/info`: Info
- GET `/ping`: Ping

## Anticipated Stream

We anticipate receiving a Json stream, such as:

```json
{
  "from": "+123456789",
  "body": "Hello world"
}
```

## Motto

> 「Cryptoni Confidimus」

## License

This is licensed under the [CORE License](LICENSE).
