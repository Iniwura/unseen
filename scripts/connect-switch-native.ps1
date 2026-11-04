$ErrorActionPreference = 'Stop'

# Run from the Windows repository checkout. Do not print local credentials,
# and never register again when a Gatekeeper ID is already configured.
function Invoke-NpmStep {
  param([Parameter(Mandatory = $true)][string]$Name)

  & npm.cmd run $Name
  if ($LASTEXITCODE -ne 0) {
    throw "UNSEEN bootstrap stopped: npm run $Name failed with exit code $LASTEXITCODE."
  }
}

Invoke-NpmStep 'diagnose:switch'

$envFile = Join-Path (Get-Location) '.env.local'
$hasGatekeeper = -not [string]::IsNullOrWhiteSpace($env:SWITCH_AGENT_ID)
if ((-not $hasGatekeeper) -and (Test-Path -LiteralPath $envFile -PathType Leaf)) {
  $hasGatekeeper = [bool](Select-String -LiteralPath $envFile -Pattern '^SWITCH_AGENT_ID=.' -Quiet)
}

if (-not $hasGatekeeper) {
  Invoke-NpmStep 'register:switch'
}

Invoke-NpmStep 'discover:switch'
Invoke-NpmStep 'connect:switch'
