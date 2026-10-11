#!/usr/bin/env bash
# One-time (and safe to re-run) cloud setup for the backend: APIs, Firestore, the frames
# bucket, the container registry and the service account Cloud Run runs as.
#
#   deploy/setup.sh
set -euo pipefail
cd "$(dirname "$0")"
source ./config.sh
g() { "$GCLOUD" --project "$PROJECT" --quiet "$@"; }

echo "› APIs"
g services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  firestore.googleapis.com iam.googleapis.com aiplatform.googleapis.com storage.googleapis.com

echo "› Firestore (Native, $REGION; the location can't change later)"
if ! g firestore databases describe --database="(default)" >/dev/null 2>&1; then
  g firestore databases create --database="(default)" --location="$REGION" --type=firestore-native
fi
# Audits, their events and the rate-limit counters delete themselves after their expireAt.
for group in audits events limits; do
  g firestore fields ttls update expireAt --collection-group="$group" --enable-ttl --async >/dev/null || true
done

echo "› Bucket gs://$BUCKET (frames, deleted after 30 days)"
if ! g storage buckets describe "gs://$BUCKET" >/dev/null 2>&1; then
  g storage buckets create "gs://$BUCKET" --location="$REGION" --uniform-bucket-level-access --public-access-prevention
fi
lifecycle=$(mktemp)
echo '{"rule":[{"action":{"type":"Delete"},"condition":{"age":30}}]}' >"$lifecycle"
g storage buckets update "gs://$BUCKET" --lifecycle-file="$lifecycle" >/dev/null
rm -f "$lifecycle"

echo "› Artifact Registry $REPO"
if ! g artifacts repositories describe "$REPO" --location="$REGION" >/dev/null 2>&1; then
  g artifacts repositories create "$REPO" --repository-format=docker --location="$REGION" \
    --description="Shop Honest backend images"
fi

echo "› Service account $SERVICE_ACCOUNT (Gemini, Firestore, its bucket; nothing else)"
if ! g iam service-accounts describe "$SERVICE_ACCOUNT" >/dev/null 2>&1; then
  g iam service-accounts create "$SERVICE" --display-name="Shop Honest API (Cloud Run)"
  sleep 10 # new service accounts take a moment to be grantable
fi
for role in roles/aiplatform.user roles/datastore.user; do
  g projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$SERVICE_ACCOUNT" --role="$role" \
    --condition=None >/dev/null
done
g storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role=roles/storage.objectAdmin >/dev/null

echo "› Cloud Build's service account: push images, write logs, read the uploaded source"
number=$(g projects describe "$PROJECT" --format='value(projectNumber)')
for role in roles/artifactregistry.writer roles/logging.logWriter roles/storage.objectViewer; do
  g projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$number-compute@developer.gserviceaccount.com" \
    --role="$role" --condition=None >/dev/null
done

echo "✓ Setup done for $PROJECT"
