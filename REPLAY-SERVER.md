# Standalone replay server

This repository can run a small local-file replay server for private Pokemon
Showdown deployments. It works with the existing `/savereplay` flow in the
battle server and does not require Docker, Postgres, MySQL, or SQLite.

## Setup

Configure the battle server and replay server to use the same replay directory:

```js
exports.routes.replays = 'replay.example.com';
exports.replaysdir = 'logs/replays';
exports.replayclientorigin = 'https://play.example.com';
```

Start the battle server normally:

```sh
npm start
```

Start the replay server:

```sh
npm run start-replay-server
```

By default, the replay server listens on `127.0.0.1:8001`. Put it behind your
HTTPS reverse proxy for the public replay domain.

## Environment variables

- `REPLAY_HOST`: public replay host used in generated replay URLs.
- `REPLAYS_DIR`: local replay JSON directory, default `logs/replays`.
- `REPLAY_SERVER_PORT`: replay server port, default `8001`.
- `REPLAY_SERVER_BIND_ADDRESS`: bind address, default `127.0.0.1`.
- `REPLAY_CLIENT_ORIGIN`: PS client origin used for replay player assets.

## Public endpoints

- `GET /`: recent public replays.
- `GET /:id`: playable replay page.
- `GET /:id.json`: replay metadata and battle log.
- `GET /:id.log`: plain battle log.
- `GET /search.json?user=&user2=&format=&page=&rating=&contains=`: JSON search.
