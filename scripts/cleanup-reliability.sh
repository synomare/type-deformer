#!/usr/bin/env bash
set -euo pipefail

git rm \
  .github/workflows/apply-reliability-fixes.yml \
  scripts/apply-reliability-fixes.py \
  .github/workflows/cleanup-reliability.yml \
  scripts/cleanup-reliability.sh
