#!/usr/bin/env bash
set -euo pipefail

git rm \
  .github/workflows/apply-confuse-prewarm.yml \
  scripts/apply-confuse-prewarm.py \
  .github/workflows/cleanup-confuse-prewarm.yml \
  scripts/cleanup-confuse-prewarm.sh
