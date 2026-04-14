#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <testnet|mainnet>"
  exit 1
fi

PROFILE="$1"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_ENV="$ROOT_DIR/.env"

case "$PROFILE" in
  testnet)
    SOURCE_ENV="$ROOT_DIR/.env.testnet.production"
    ;;
  mainnet)
    SOURCE_ENV="$ROOT_DIR/.env.mainnet.production"
    ;;
  *)
    echo "Unknown profile: $PROFILE"
    echo "Expected one of: testnet, mainnet"
    exit 1
    ;;
esac

cp "$SOURCE_ENV" "$TARGET_ENV"

if [[ "$PROFILE" == "testnet" && -f "$ROOT_DIR/.env.testnet.local" ]]; then
  {
    echo ""
    echo "# --- Local Testnet Overrides (from .env.testnet.local) ---"
    cat "$ROOT_DIR/.env.testnet.local"
  } >> "$TARGET_ENV"
fi

echo "Applied $PROFILE profile to .env"
if [[ "$PROFILE" == "testnet" ]]; then
  echo "Next: review AGENT_PRIVATE_KEY and optional webhook/token values"
else
  echo "Next: fill all replace-* values, set SECURITY_REVIEW_SIGNED_OFF=true only after review"
fi
