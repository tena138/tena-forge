# Tena Forge Production Deployment

## Fast Path: One VPS With Docker Compose

1. Point DNS records at the VPS:
   - `app.example.com` -> VPS IP
   - `api.example.com` -> VPS IP

2. Copy `.env.production.example` to `.env.production` and replace every secret/domain.

3. Start production services:

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

4. Check services:

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml ps
curl https://api.example.com/health
```

Caddy automatically requests HTTPS certificates for `APP_DOMAIN` and `API_DOMAIN`.

## Render + Vercel

Backend:

1. Push this repository to GitHub.
2. Create a Render Blueprint from `render.yaml`, or create a Docker web service manually from `backend/Dockerfile`.
3. Set required backend secrets:
   - `OPENAI_API_KEY`
   - `FRONTEND_URL`
   - `CORS_ORIGIN`
   - `ENCRYPTION_KEY`
4. Use a Render Postgres database.
5. Use a Render persistent disk mounted at `/uploads`, or switch `STORAGE_TYPE=s3`.

Frontend:

1. Create a Vercel project with root directory `frontend`.
2. Set:
   - `NEXT_PUBLIC_API_URL=https://your-render-api-domain`
3. Deploy.

## Production Notes

- Do not use SQLite in production.
- Do not run the backend with `--reload` in production.
- Keep `SECRET_KEY`, `REFRESH_SECRET_KEY`, `ENCRYPTION_KEY`, and `OPENAI_API_KEY` out of Git.
- The PDF/AI extraction pipeline runs long jobs and should stay on a container or VPS, not a serverless API route.
- Local uploads are acceptable for an MVP only if the disk is persistent. For multi-instance scaling, use S3/R2 and set `STORAGE_TYPE=s3`.
