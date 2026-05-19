$ErrorActionPreference = "Stop"

Set-Location "$PSScriptRoot\frontend"
if (Test-Path ".next") {
  Remove-Item -LiteralPath ".next" -Recurse -Force
}
npm run dev -- -H 0.0.0.0 -p 3001
