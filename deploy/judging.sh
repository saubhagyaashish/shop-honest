#!/usr/bin/env bash
# Judging-day mode for the backend:
#
#   deploy/judging.sh on    one instance kept warm (no cold starts), 15 live runs per visitor per hour
#                           (judges may share one Wi-Fi IP), uptime probe + alert on /api/health
#   deploy/judging.sh off   back to normal: scale to zero, 3 per visitor per hour, no probe
#
# The 100-a-day cap stays either way. A warm instance costs money all day, so turn it off after.
# deploy/backend.sh resets to normal, so run "on" again after redeploying on a judging day.
set -euo pipefail
cd "$(dirname "$0")/.."
source deploy/config.sh
g() { "$GCLOUD" --project "$PROJECT" --quiet "$@"; }

case "${1:-}" in
  on) min=1 per_ip=${JUDGING_PER_IP:-15} ;;
  off) min=0 per_ip=3 ;;
  *) echo "usage: deploy/judging.sh on|off" >&2; exit 2 ;;
esac

echo "› $SERVICE: min instances $min, $per_ip live runs per visitor per hour"
g run services update "$SERVICE" --region "$REGION" --min-instances "$min" --update-env-vars "LIVE_PER_IP_PER_HOUR=$per_ip" 2>&1 \
  | grep -E "revision|Done" || true
echo "› Uptime probe $1"
uv run --project backend python deploy/monitoring.py uptime "$1"
echo "✓ Judging mode $1"
