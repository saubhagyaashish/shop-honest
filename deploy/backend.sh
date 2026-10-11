#!/usr/bin/env bash
# Build the backend image with Cloud Build and deploy it to Cloud Run.
#
#   deploy/backend.sh
#
# Run deploy/setup.sh once first. For judging days, keep one instance warm:
#   gcloud run services update shop-honest-api --region asia-south1 --min-instances 1   (and back to 0 after)
set -euo pipefail
cd "$(dirname "$0")/.."
source deploy/config.sh
g() { "$GCLOUD" --project "$PROJECT" --quiet "$@"; }

TAG="$(git rev-parse --short HEAD)"
git diff --quiet HEAD -- backend shared || TAG="$TAG-dirty-$(date +%H%M%S)"
IMAGE="$IMAGE_BASE:$TAG"

echo "› Building $IMAGE"
g builds submit --region "$REGION" --config deploy/cloudbuild.yaml --substitutions "_IMAGE=$IMAGE" .

env_file=$(mktemp)
{ cat deploy/backend.env.yaml; echo "VERSION: \"$TAG\""; } >"$env_file"
echo "› Deploying $SERVICE ($REGION)"
g run deploy "$SERVICE" --image "$IMAGE" --region "$REGION" --service-account "$SERVICE_ACCOUNT" \
  --execution-environment gen2 --cpu 2 --memory 2Gi --no-cpu-throttling \
  --concurrency 20 --min-instances 0 --max-instances 3 --timeout 900 \
  --allow-unauthenticated --env-vars-file "$env_file"
rm -f "$env_file"
echo "✓ $SERVICE is at $(g run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
