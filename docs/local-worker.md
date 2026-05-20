# Local Extraction Worker

Run heavy PDF extraction on your own computer while the hosted Tena Forge site keeps
the queue, progress, and saved results.

## Setup

From the repository root:

```powershell
cd backend
python -m pip install -r requirements.txt
cd ..
$env:OPENAI_API_KEY="your-openai-api-key"
```

## Run Once

```powershell
python tools/local_extraction_worker.py --email "you@example.com"
```

The worker asks for your Tena Forge password, claims the oldest pending archive
batch for that account, downloads the PDFs, extracts locally, uploads review
page snapshots, and saves the extracted problems back to the hosted API.

## Keep Watching

```powershell
python tools/local_extraction_worker.py --email "you@example.com" --watch
```

Optional environment variables:

- `TENA_FORGE_API_URL`: API URL, defaults to `https://tena-forge-api.onrender.com`
- `TENA_FORGE_EMAIL`
- `TENA_FORGE_PASSWORD`
- `TENA_FORGE_ACCESS_TOKEN`
- `TENA_FORGE_TOTP_CODE`
- `OPENAI_API_KEY`
