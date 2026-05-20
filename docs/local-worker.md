# Local Extraction Worker

Run heavy PDF extraction on your own computer while the hosted Tena Forge site keeps
the queue, progress, and saved results.

## Windows: easiest path

From Explorer, double-click:

```text
tools/start_local_worker_windows.cmd
```

The launcher creates a dedicated `.local-worker-venv`, installs the required Python
packages, asks for your Tena Forge email and OpenAI API key if needed, then runs the
worker in watch mode.

It does not use the repository `.venv`, so it is a realistic installation check.
To force a clean reinstall from PowerShell:

```powershell
.\tools\start_local_worker_windows.ps1 -Clean -InstallOnly -VenvPath .local-worker-test-venv
```

To let the web app open the worker after a local-processing upload, register the
browser handoff protocol once:

```text
tools/register_local_worker_protocol_windows.cmd
```

After this, a browser prompt for `tenaforge://` links can open the worker. The
user still needs to approve the browser/Windows prompt.

## Manual setup

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
