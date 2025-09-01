# Deepcuts Bot (Share‑Safe & Easy)

A hardened, **out‑of‑the‑box** version of your Turntable.fm room bot.

- Safe to publish to GitHub (no secrets committed).
- One‑command run via **Docker** or plain **Node.js**.
- Automatic preflight checks (clear errors if env vars are missing).
- Persistent state saved to a folder or Docker volume.

## 0) Get the code
```bash
git clone <your-repo-url>
cd deepcuts-bot-share-safe
cp .env.example .env
# Fill in BOT_USER_TOKEN and HANGOUT_ID at minimum
```

## 1) Run with Docker (recommended for most users)
```bash
docker compose up --build
```
- State persists in `./data` (mapped to `/app/data` in the container).
- Stop with `Ctrl+C`. To run in background: `docker compose up -d`.
- Logs: `docker compose logs -f`.

## 2) Run locally with Node.js
Requires Node 18+.
```bash
npm i
npm start
```
If anything is missing, the preflight script explains what to fix.

## Environment
See `.env.example` for all supported variables. Only `BOT_USER_TOKEN` and `HANGOUT_ID` are required.

## Safety
- `SAFE_MODE=true` (default) enforces HTTPS and an allow‑list for gateway domains and confines the `STATE_FILE` to this project.
- Secrets belong only in `.env` (git‑ignored). Never commit real tokens.
- Rotate tokens if you ever shared them anywhere.

## Deploy
- **Docker**: Use the provided `Dockerfile` and `docker-compose.yml` on your server/VM/NAS.
- **GitHub Actions**: The provided workflow builds and pushes a container image to GHCR when you push a tag like `v1.0.0`. See `.github/workflows/docker.yml`.

## Make targets (optional)
```bash
make run            # npm start locally
make docker-build   # docker image build
make docker-run     # run container with compose
```

## License
MIT — see `LICENSE`.
