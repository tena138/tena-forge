$ErrorActionPreference = "Stop"

$rootEnv = Join-Path $PSScriptRoot ".env"
if (Test-Path $rootEnv) {
  Get-Content $rootEnv | ForEach-Object {
    if ($_ -match "^\s*#" -or $_ -notmatch "=") {
      return
    }
    $parts = $_ -split "=", 2
    $name = $parts[0].Trim()
    $value = $parts[1].Trim()
    if ($name) {
      [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
  }
}

Set-Location "$PSScriptRoot\backend"

$env:DATABASE_URL = "sqlite:///./tenaforge.db"
$env:UPLOADS_DIR = "uploads"
$env:CORS_ORIGIN = "http://localhost:3001"
$env:FRONTEND_URL = "http://localhost:3001"
if (-not $env:AI_MODEL_POOL) { $env:AI_MODEL_POOL = "gpt-5.4-mini,gpt-5-mini" }
if (-not $env:AI_SOLUTION_MODEL_POOL) { $env:AI_SOLUTION_MODEL_POOL = "gpt-5.4-mini,gpt-5-mini" }
if (-not $env:AI_REQUESTS_PER_MINUTE) { $env:AI_REQUESTS_PER_MINUTE = "60" }
if (-not $env:AI_CONCURRENT_REQUESTS) { $env:AI_CONCURRENT_REQUESTS = "8" }
if (-not $env:AI_SOLUTION_MODE) { $env:AI_SOLUTION_MODE = "full" }
if (-not $env:AI_SOLUTION_MAX_OUTPUT_TOKENS) { $env:AI_SOLUTION_MAX_OUTPUT_TOKENS = "8192" }
if (-not $env:AI_SOLUTION_IMAGE_DETAIL) { $env:AI_SOLUTION_IMAGE_DETAIL = "high" }
if (-not $env:AI_IMAGE_FORMAT) { $env:AI_IMAGE_FORMAT = "jpeg" }
if (-not $env:AI_IMAGE_JPEG_QUALITY) { $env:AI_IMAGE_JPEG_QUALITY = "82" }
if (-not $env:PDF_RENDER_DPI) { $env:PDF_RENDER_DPI = "180" }
if (-not $env:PDF_SOLUTION_RENDER_DPI) { $env:PDF_SOLUTION_RENDER_DPI = "180" }
if (-not $env:PDF_LARGE_FILE_DPI) { $env:PDF_LARGE_FILE_DPI = "160" }

if (-not $env:OPENAI_API_KEY) {
  Write-Host "OPENAI_API_KEY is not set. Upload will work, but AI processing will fail until you set it." -ForegroundColor Yellow
}

python -m uvicorn main:app --host 0.0.0.0 --port 8000
