#!/usr/bin/env bash
# Judging-day mode for the backend:
#
#   deploy/judging.sh on    one instance kept warm (no cold starts), uptime probe + alert on /api/health
#   deploy/judging.sh off   back to normal: scale to zero, no probe
#
# Live-run limits don't change: no per-visitor limit, and the 100-a-day site cap stays. A warm instance costs money all day, so turn it off after.
# deploy/backend.sh resets to normal, so run "on" again after redeploying on a judging day.
set -euo pipefail
cd "$(dirname "$0")/.."
source deploy/config.sh
g() { "$GCLOUD" --project "$PROJECT" --quiet "$@"; }

case "${1:-}" in
  on) min=1 ;;
  off) min=0 ;;
  *) echo "usage: deploy/judging.sh on|off" >&2; exit 2 ;;
esac

echo "› $SERVICE: min instances $min"
g run services update "$SERVICE" --region "$REGION" --min-instances "$min" 2>&1 \
  | grep -E "revision|Done" || true
echo "› Uptime probe $1"
uv run --project backend python deploy/monitoring.py uptime "$1"
echo "✓ Judging mode $1"
