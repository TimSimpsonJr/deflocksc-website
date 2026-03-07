#!/bin/bash
set -euo pipefail

# Only run in remote (cloud) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Install Node.js dependencies
npm install --prefix "$CLAUDE_PROJECT_DIR"

# Install Python dependencies
pip install -r "$CLAUDE_PROJECT_DIR/requirements.txt"
