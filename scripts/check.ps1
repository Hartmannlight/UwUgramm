$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

function Invoke-Check {
    param([string]$Command, [string[]]$Arguments)
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Prüfung fehlgeschlagen: $Command $($Arguments -join ' ')"
    }
}

Push-Location (Join-Path $projectRoot 'backend')
try {
    New-Item -ItemType Directory -Force -Path '.local' | Out-Null
    $testDirectory = '.local/check-pytest-' + [guid]::NewGuid().ToString('N')
    Invoke-Check -Command 'uv' -Arguments @('run', '--frozen', 'python', '-m', 'pytest', '-q', '--basetemp', $testDirectory)
    Invoke-Check -Command 'uv' -Arguments @('run', '--frozen', 'mypy', 'app')
    Invoke-Check -Command 'uv' -Arguments @('run', '--frozen', 'ruff', 'check', '--config', 'pyproject.toml', 'app', 'tests', 'migrations', '../scripts')
    Invoke-Check -Command 'uv' -Arguments @('run', '--frozen', 'ruff', 'format', '--config', 'pyproject.toml', '--check', 'app', 'tests', 'migrations', '../scripts')
    Invoke-Check -Command 'uv' -Arguments @('run', '--frozen', 'python', '-m', 'unittest', 'discover', '-s', '../scripts/tests', '-v')
} finally {
    Pop-Location
}

Push-Location (Join-Path $projectRoot 'frontend')
try {
    Invoke-Check -Command 'npm' -Arguments @('test')
    Invoke-Check -Command 'npm' -Arguments @('run', 'format:check')
    Invoke-Check -Command 'npm' -Arguments @('run', 'build')
} finally {
    Pop-Location
}
