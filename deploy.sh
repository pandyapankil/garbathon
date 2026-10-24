#!/bin/bash
set -e

# Load local environment variables if present
if [ -f "$(dirname "$0")/env.sh" ]; then
  source "$(dirname "$0")/env.sh"
fi

PROJECT_ID="${1:-${GCP_PROJECT_ID:-promptwars-aug29}}"
SERVICE_NAME="${GCP_SERVICE_NAME:-job-hunt-autopilot}"
REGION="${GCP_REGION:-asia-south1}"

echo "🚀 Deploying to Cloud Run on project: ${PROJECT_ID}..."
echo "📍 Service: ${SERVICE_NAME} | Region: ${REGION}"

# Set active project in gcloud
gcloud config set project "${PROJECT_ID}" --quiet

# Deploy source directly via Cloud Run
gcloud run deploy "${SERVICE_NAME}" \
  --project "${PROJECT_ID}" \
  --source . \
  --region "${REGION}" \
  --allow-unauthenticated \
  --set-env-vars "\
GEMINI_API_KEY=${GEMINI_API_KEY},\
FIREBASE_API_KEY=${FIREBASE_API_KEY},\
FIREBASE_AUTH_DOMAIN=${FIREBASE_AUTH_DOMAIN},\
FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID:-${PROJECT_ID}},\
FIREBASE_STORAGE_BUCKET=${FIREBASE_STORAGE_BUCKET},\
FIREBASE_MESSAGING_SENDER_ID=${FIREBASE_MESSAGING_SENDER_ID},\
FIREBASE_APP_ID=${FIREBASE_APP_ID}" \
  --quiet

echo ""
echo "✅ Deploy complete! Live URL:"
gcloud run services describe "${SERVICE_NAME}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --format "value(status.url)"
