#!/bin/bash
set -euo pipefail

# Install JS dependencies so tests, linting, type-checking and builds work
# in Claude Code on the web sessions. Idempotent and non-interactive.

cd "$CLAUDE_PROJECT_DIR"
npm install --no-audit --no-fund
