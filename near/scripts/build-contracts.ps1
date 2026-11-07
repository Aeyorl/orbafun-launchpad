$ErrorActionPreference = 'Stop'
$NearDir = Split-Path -Parent $PSScriptRoot
cargo near build non-reproducible-wasm --manifest-path (Join-Path $NearDir 'contracts/token/Cargo.toml')
cargo near build non-reproducible-wasm --manifest-path (Join-Path $NearDir 'contracts/launchpad/Cargo.toml')
