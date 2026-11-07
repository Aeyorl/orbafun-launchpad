$ErrorActionPreference = 'Stop'

$nearDir = Split-Path -Parent $PSScriptRoot
$wslHome = (& wsl.exe -d Ubuntu -- bash -lc 'printf %s "$HOME"').Trim()
if (-not $wslHome.StartsWith('/')) {
    throw 'Could not determine the Ubuntu WSL home directory.'
}
$nearDirWsl = (& wsl.exe -d Ubuntu -- wslpath -a $nearDir).Trim()
$dataDir = "$wslHome/.local/share/orba-near-postgres"
$socketDir = "$wslHome/.local/share"
$logPath = "$wslHome/.local/share/orba-near-postgres.log"

$databaseCommand = @"
set -e
mkdir -p '$socketDir'
if [ ! -d '$dataDir' ]; then
  /usr/lib/postgresql/17/bin/initdb -D '$dataDir' -U orbafun --auth-local=trust --auth-host=trust >/dev/null
fi
if ! /usr/lib/postgresql/17/bin/pg_ctl -D '$dataDir' status >/dev/null 2>&1; then
  /usr/lib/postgresql/17/bin/pg_ctl -D '$dataDir' -l '$logPath' -o '-p 55432 -h 127.0.0.1 -k $socketDir' -w start
fi
/usr/lib/postgresql/17/bin/createdb -h 127.0.0.1 -p 55432 -U orbafun orba_near 2>/dev/null || true
"@
& wsl.exe -d Ubuntu -- bash -lc $databaseCommand
if ($LASTEXITCODE -ne 0) {
    throw 'Could not start the isolated NEAR PostgreSQL database in WSL.'
}

$latestBlockRequest = @{
    jsonrpc = '2.0'
    id = 'orba-near-startup'
    method = 'block'
    params = @{ finality = 'final' }
} | ConvertTo-Json -Depth 4
$rpcUrl = 'https://near-testnet.drpc.org'
$latestBlock = (Invoke-RestMethod -Method Post -Uri $rpcUrl -ContentType 'application/json' -Body $latestBlockRequest).result.header.height

$apiCommand = @"
cd '$nearDirWsl' && DATABASE_URL='postgres://orbafun@127.0.0.1:55432/orba_near' NEAR_RPC_URL='$rpcUrl' LAUNCHPAD_ACCOUNT_ID='launchpad.orba-near-demo-41c9.testnet' NEAR_USDC_ACCOUNT_ID='3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af' INDEXER_START_BLOCK='$latestBlock' INDEXER_BATCH_BLOCKS=50 RUST_LOG=info '/home/aeyo/.cargo/bin/cargo' run -p orba-near-api
"@
& wsl.exe -d Ubuntu -- bash -lc $apiCommand
exit $LASTEXITCODE
