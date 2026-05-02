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
exports.replaypublicpath = ''; // set to '/replay' when reverse-proxying under /replay/
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
- `REPLAY_PUBLIC_PATH`: public URL path prefix, for example `/replay` when
  Nginx proxies `https://play.example.com/replay/` to the replay server.

## Public endpoints

- `GET /`: recent public replays.
- `GET /:id`: playable replay page.
- `GET /:id.json`: replay metadata and battle log.
- `GET /:id.log`: plain battle log.
- `GET /search.json?user=&user2=&format=&page=&rating=&contains=`: JSON search.

If the server is mounted below a path such as `/replay/`, keep these internal
paths unchanged in Node and set `REPLAY_PUBLIC_PATH=/replay`; the reverse proxy
should strip the prefix before forwarding to the replay server.

## Cleaning old replays

Local replay JSON files can be cleaned without stopping the replay server:

```sh
REPLAYS_DIR=/var/www/pokemon-showdown/logs/replays npm run cleanup-replays -- --days=30 --dry-run
REPLAYS_DIR=/var/www/pokemon-showdown/logs/replays npm run cleanup-replays -- --days=30
```

For a low-resource server, a daily systemd timer is enough. Create
`/etc/systemd/system/ps-replay-cleanup.service`:

```ini
[Unit]
Description=Clean old Pokemon Showdown replay files

[Service]
Type=oneshot
WorkingDirectory=/var/www/pokemon-showdown
Environment=REPLAYS_DIR=/var/www/pokemon-showdown/logs/replays
ExecStart=/usr/bin/npm run cleanup-replays -- --days=30
```

Create `/etc/systemd/system/ps-replay-cleanup.timer`:

```ini
[Unit]
Description=Run Pokemon Showdown replay cleanup daily

[Timer]
OnCalendar=*-*-* 04:30:00
Persistent=true

[Install]
WantedBy=timers.target
```

Enable it:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now ps-replay-cleanup.timer
sudo systemctl list-timers ps-replay-cleanup.timer
```
