#!/bin/sh
# skillshare runner
# Usage: sh run.sh [command] [args]
set -e

REPO="runkids/skillshare"
CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/skillshare"
BIN_DIR="$CACHE_DIR/bin"
BINARY="$BIN_DIR/skillshare"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info() { printf "${CYAN}[skillshare]${NC} %s\n" "$1" >&2; }
success() { printf "${GREEN}[skillshare]${NC} %s\n" "$1" >&2; }
warn() { printf "${YELLOW}[skillshare]${NC} %s\n" "$1" >&2; }
error() { printf "${RED}[skillshare]${NC} %s\n" "$1" >&2; exit 1; }

# Main logic
main() {
  if command -v skillshare >/dev/null 2>&1; then
    exec skillshare "$@"
  fi

  if [ -x "$BINARY" ]; then
    exec "$BINARY" "$@"
  fi

  warn "skillshare is not installed."
  info "Install it from https://github.com/${REPO} and re-run this command."
  info "This mirror does not auto-download executables."
  error "No local skillshare binary found in PATH or at $BINARY"
}

main "$@"
