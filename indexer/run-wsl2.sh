#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

INDEXER_DIR="$HOME/orbafun-indexer"
SRC_DIR="/mnt/c/Project folder/arc launchpad/indexer"

echo "Syncing files to $INDEXER_DIR..."
rm -rf "$INDEXER_DIR/src"
mkdir -p "$INDEXER_DIR/src/handlers"
cp "$SRC_DIR/config.yaml" "$INDEXER_DIR/"
cp "$SRC_DIR/schema.graphql" "$INDEXER_DIR/"
cp "$SRC_DIR/package.json" "$INDEXER_DIR/"
cp -r "$SRC_DIR/abis" "$INDEXER_DIR/"
cp "$SRC_DIR/src/handlers/index.ts" "$INDEXER_DIR/src/handlers/index.ts"

echo "Files:"
find "$INDEXER_DIR/src" -type f

echo "---"
echo "Stopping old containers..."
docker stop envio-postgres envio-hasura 2>/dev/null
docker rm envio-postgres envio-hasura 2>/dev/null

echo "---"
echo "Running codegen..."
cd "$INDEXER_DIR"
envio codegen 2>&1
echo "CODEGEN_EXIT=$?"

echo "---"
echo "Starting dev (reset)..."
# Limit partition concurrency to 1 — Arc testnet's RPC rate limit can't
# handle Envio's default parallel partition queries (causes a retry storm
# that starves the frontend's RPC reads).
export ENVIO_MAX_PARTITION_CONCURRENCY=1
envio dev -r 2>&1
echo "DEV_EXIT=$?"
