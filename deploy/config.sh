# Shared names for the deploy scripts. Source it; don't run it.
PROJECT=shop-honest-72fd8
REGION=asia-south1
SERVICE=shop-honest-api
REPO=shop-honest
BUCKET=shop-honest-72fd8-audits
SERVICE_ACCOUNT="$SERVICE@$PROJECT.iam.gserviceaccount.com"
IMAGE_BASE="$REGION-docker.pkg.dev/$PROJECT/$REPO/api"
GCLOUD=${GCLOUD:-$(command -v gcloud || echo "$HOME/google-cloud-sdk/bin/gcloud")}
BQ=${BQ:-$(command -v bq || echo "$(dirname "$GCLOUD")/bq")}
# bq calls gcloud for credentials, so the SDK's folder must be on PATH.
export PATH="$(dirname "$GCLOUD"):$PATH"
BQ_DATASET=shop_honest
