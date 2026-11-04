$ErrorActionPreference = 'Stop'

# Run this from the Windows checkout. It never prints .env.local and never
# rotates an existing Gatekeeper registration.
npm.cmd run diagnose:switch

$envFile = Join-Path (Get-Location) '.env.local'
$hasGatekeeper = Test-Path $envFile -PathType Leaf -and (Select-String -LiteralPath $envFile -Pattern '^SWITCH_AGENT_ID=.' -Quiet)
if (-not $hasGatekeeper) {
  npm.cmd run register:switch
}

npm.cmd run discover:switch
npm.cmd run connect:switch
