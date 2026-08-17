#!/usr/bin/env bash
# main의 iPing drain workflow를 한 번 dispatch한다.
# GitHub 예약은 best-effort라 5분 주기를 지키지 못하므로 상시 호스트의 cron이
# 이 스크립트를 호출한다. 이미 실행 중이거나 대기 중인 실행이 있으면 건너뛴다.
set -euo pipefail

repository="${BUSU_REPOSITORY:-iamdenny/pingpong-busu}"
workflow="crawl-scheduled.yml"

if ! command -v gh >/dev/null 2>&1; then
  echo "dispatch-drain: gh CLI not found" >&2
  exit 1
fi

if [ -z "${GH_TOKEN:-}" ] && ! gh auth status >/dev/null 2>&1; then
  echo "dispatch-drain: missing GitHub credentials" >&2
  exit 1
fi

active="$(
  gh run list \
    --repo "$repository" \
    --workflow "$workflow" \
    --limit 20 \
    --json status \
    --jq '[.[] | select(.status == "in_progress" or .status == "queued" or .status == "waiting")] | length'
)"

if [ "$active" != "0" ]; then
  echo "dispatch-drain: skipped, $active run(s) already active"
  exit 0
fi

gh workflow run "$workflow" \
  --repo "$repository" \
  --ref main \
  --field mode=drain-iping

echo "dispatch-drain: requested one drain run"
