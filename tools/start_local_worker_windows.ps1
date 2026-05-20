param(
    [switch]$Clean,
    [switch]$InstallOnly,
    [switch]$Once,
    [string]$VenvPath,
    [string]$ProtocolUrl
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = (Resolve-Path (Join-Path $ScriptDir "..")).Path
$BackendRequirements = Join-Path $Root "backend\requirements.txt"
$WorkerScript = Join-Path $Root "tools\local_extraction_worker.py"
$ConfigPath = Join-Path $Root ".local-worker.env"
$DefaultApiUrl = "https://tena-forge-api.onrender.com"

if (-not $VenvPath) {
    $VenvPath = Join-Path $Root ".local-worker-venv"
}
if (-not [System.IO.Path]::IsPathRooted($VenvPath)) {
    $VenvPath = Join-Path $Root $VenvPath
}

function Read-ProtocolQuery {
    param([string]$Url)
    $values = @{}
    if (-not $Url) {
        return $values
    }
    try {
        $uri = [Uri]$Url
        $query = $uri.Query.TrimStart("?")
        if (-not $query) {
            return $values
        }
        foreach ($pair in $query.Split("&")) {
            if (-not $pair) {
                continue
            }
            $parts = $pair.Split("=", 2)
            $key = [Uri]::UnescapeDataString($parts[0])
            $value = if ($parts.Length -gt 1) { [Uri]::UnescapeDataString($parts[1]) } else { "" }
            if ($key) {
                $values[$key] = $value
            }
        }
    } catch {
        Write-Host "Could not parse protocol URL. Continuing with saved settings." -ForegroundColor Yellow
    }
    return $values
}

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Read-EnvFile {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }
    Get-Content -LiteralPath $Path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
            return
        }
        $key, $value = $line.Split("=", 2)
        $key = $key.Trim()
        $value = $value.Trim()
        if ($key -and -not [Environment]::GetEnvironmentVariable($key, "Process")) {
            [Environment]::SetEnvironmentVariable($key, $value, "Process")
        }
    }
}

function Write-EnvFile {
    param(
        [string]$Path,
        [hashtable]$Values
    )
    $lines = @(
        "# Tena Forge local worker settings",
        "# This file stays on this computer and is ignored by Git."
    )
    foreach ($key in ($Values.Keys | Sort-Object)) {
        $value = [string]$Values[$key]
        if ($value) {
            $lines += "$key=$value"
        }
    }
    Set-Content -LiteralPath $Path -Value $lines -Encoding UTF8
}

function Get-PythonInvocation {
    $candidates = @(
        @{ Exe = "py"; Prefix = @("-3") },
        @{ Exe = "python"; Prefix = @() },
        @{ Exe = "python3"; Prefix = @() }
    )

    foreach ($candidate in $candidates) {
        try {
            $arguments = @($candidate.Prefix + @("-c", "import sys; print(sys.version_info[0]); print(sys.version_info[1])"))
            $output = & $candidate.Exe @arguments 2>$null
            if ($LASTEXITCODE -ne 0 -or $output.Count -lt 2) {
                continue
            }
            $major = [int]$output[0]
            $minor = [int]$output[1]
            if ($major -gt 3 -or ($major -eq 3 -and $minor -ge 10)) {
                return $candidate
            }
        } catch {
            continue
        }
    }

    throw "Python 3.10 or newer is required. Install it from https://www.python.org/downloads/ and run this again."
}

function Invoke-BasePython {
    param(
        [hashtable]$Python,
        [string[]]$Arguments
    )
    $allArguments = @($Python.Prefix + $Arguments)
    & $Python.Exe @allArguments
}

function Ensure-Venv {
    param(
        [string]$Path,
        [string]$RequirementsPath,
        [switch]$ForceClean
    )

    if ($ForceClean -and (Test-Path -LiteralPath $Path)) {
        Write-Step "Removing existing local worker virtual environment"
        Remove-Item -LiteralPath $Path -Recurse -Force
    }

    $pythonExe = Join-Path $Path "Scripts\python.exe"
    if (-not (Test-Path -LiteralPath $pythonExe)) {
        Write-Step "Creating dedicated Python virtual environment"
        $python = Get-PythonInvocation
        $null = Invoke-BasePython -Python $python -Arguments @("-m", "venv", $Path)
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to create the Python virtual environment."
        }
    }

    $hashPath = Join-Path $Path ".requirements.sha256"
    $currentHash = (Get-FileHash -LiteralPath $RequirementsPath -Algorithm SHA256).Hash
    $savedHash = if (Test-Path -LiteralPath $hashPath) { Get-Content -LiteralPath $hashPath -Raw } else { "" }

    if ($currentHash -ne $savedHash.Trim()) {
        Write-Step "Installing/updating required packages"
        $null = & $pythonExe -m pip install --upgrade pip
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to update pip."
        }
        $null = & $pythonExe -m pip install -r $RequirementsPath
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to install packages."
        }
        Set-Content -LiteralPath $hashPath -Value $currentHash -Encoding ASCII
    } else {
        Write-Step "Required packages are already installed"
    }

    return $pythonExe
}

Read-EnvFile -Path $ConfigPath

$protocolValues = Read-ProtocolQuery -Url $ProtocolUrl
if ($protocolValues["api_url"]) {
    $env:TENA_FORGE_API_URL = $protocolValues["api_url"]
}

if (-not $env:TENA_FORGE_API_URL) {
    $env:TENA_FORGE_API_URL = $DefaultApiUrl
}

$pythonExe = Ensure-Venv -Path $VenvPath -RequirementsPath $BackendRequirements -ForceClean:$Clean

Write-Step "Checking local worker imports"
& $pythonExe $WorkerScript --help *> $null
if ($LASTEXITCODE -ne 0) {
    throw "Failed to import/run the local worker."
}

if ($InstallOnly) {
    Write-Host ""
    Write-Host "Install check passed: the local worker runs in a separate environment from the project .venv." -ForegroundColor Green
    exit 0
}

if (-not $env:TENA_FORGE_EMAIL) {
    $email = Read-Host "Tena Forge login email"
    if (-not $email.Trim()) {
        throw "Email is required."
    }
    $env:TENA_FORGE_EMAIL = $email.Trim()
}

if (-not $env:OPENAI_API_KEY) {
    $openAiKey = Read-Host "OpenAI API key"
    if (-not $openAiKey.Trim()) {
        throw "OPENAI_API_KEY is required."
    }
    $env:OPENAI_API_KEY = $openAiKey.Trim()
}

$existingConfig = @{
    "TENA_FORGE_API_URL" = $env:TENA_FORGE_API_URL
    "TENA_FORGE_EMAIL" = $env:TENA_FORGE_EMAIL
}

if (Test-Path -LiteralPath $ConfigPath) {
    Read-EnvFile -Path $ConfigPath
}

if (-not (Test-Path -LiteralPath $ConfigPath)) {
    $saveKey = Read-Host "Save email/API URL on this PC for next run? (Y/n)"
    if ($saveKey.Trim().ToLowerInvariant() -ne "n") {
        Write-EnvFile -Path $ConfigPath -Values $existingConfig
        Write-Host ".local-worker.env saved" -ForegroundColor DarkGray
    }
}

$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"

Write-Step "Starting Tena Forge local worker"
if ($ProtocolUrl) {
    Write-Host "Launched from browser handoff."
    if ($protocolValues["batch_id"]) {
        Write-Host "Requested batch: $($protocolValues["batch_id"])"
    }
}
Write-Host "API: $env:TENA_FORGE_API_URL"
Write-Host "Email: $env:TENA_FORGE_EMAIL"
Write-Host "Enter your password in the next prompt. It will not be displayed."

$workerArgs = @($WorkerScript, "--api-url", $env:TENA_FORGE_API_URL, "--email", $env:TENA_FORGE_EMAIL)
if (-not $Once) {
    $workerArgs += "--watch"
}

& $pythonExe @workerArgs
if ($LASTEXITCODE -ne 0) {
    throw "Local worker exited with error code $LASTEXITCODE."
}
