$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$WorkerLauncher = Join-Path $ScriptDir "start_local_worker_windows.ps1"
$SchemeRoot = "HKCU:\Software\Classes\tenaforge"
$CommandKey = Join-Path $SchemeRoot "shell\open\command"
$PowerShellExe = Join-Path $PSHOME "powershell.exe"

if (-not (Test-Path -LiteralPath $WorkerLauncher)) {
    throw "Local worker launcher was not found: $WorkerLauncher"
}

New-Item -Path $SchemeRoot -Force | Out-Null
Set-Item -Path $SchemeRoot -Value "URL:Tena Forge Local Worker"
New-ItemProperty -Path $SchemeRoot -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null

New-Item -Path (Join-Path $SchemeRoot "DefaultIcon") -Force | Out-Null
Set-Item -Path (Join-Path $SchemeRoot "DefaultIcon") -Value "`"$PowerShellExe`",0"

New-Item -Path $CommandKey -Force | Out-Null
$command = "`"$PowerShellExe`" -NoProfile -ExecutionPolicy Bypass -File `"$WorkerLauncher`" -ProtocolUrl `"%1`""
Set-Item -Path $CommandKey -Value $command

Write-Host ""
Write-Host "Tena Forge local worker protocol registered." -ForegroundColor Green
Write-Host "Browser handoff links can now open the local worker with: tenaforge://worker/start"
