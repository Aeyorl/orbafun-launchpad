#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# Copy indexer to WSL native filesystem for npm install to work
INDEXER_DIR="$HOME/orbafun-indexer"
SRC_DIR="/mnt/c/Project folder/arc launchpad/indexer"

echo "Copying indexer to $INDEXER_DIR..."
rm -rf "$INDEXER_DIR"
mkdir -p "$INDEXER_DIR"

# Copy all files except node_modules and .envio
cp "$SRC_DIR/config.yaml" "$INDEXER_DIR/"
cp "$SRC_DIR/schema.graphql" "$INDEXER_DIR/"
cp "$SRC_DIR/package.json" "$INDEXER_DIR/"
cp -r "$SRC_DIR/abis" "$INDEXER_DIR/"
cp -r "$SRC_DIR/src" "$INDEXER_DIR/"

echo "Files copied:"
ls -la "$INDEXER_DIR/"

echo "---"
echo "Installing dependencies..."
cd "$INDEXER_DIR"
npm install 2>&1 | tail -10
echo "NPM_EXIT=$?"

echo "---"
echo "Running codegen..."
envio codegen 2>&1
echo "CODEGEN_EXIT=$?"

echo "---"
echo "Starting dev..."
envio dev 2>&1
echo "DEV_EXIT=$?"
