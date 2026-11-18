#!/usr/bin/env bash
set -Eeuo pipefail

# Store these in /etc/alveron/company-intelligence.env with chmod 600.
ENV_FILE="${ALVERON_INTELLIGENCE_ENV_FILE:-/etc/alveron/company-intelligence.env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

API_BASE="${ALVERON_API_BASE:-http://127.0.0.1:3100}"
: "${ALVERON_WEBHOOK_TOKEN:?Set ALVERON_WEBHOOK_TOKEN in $ENV_FILE}"

curl --fail --silent --show-error \
  --max-time 600 \
  --request POST \
  --header "X-Webhook-Key: $ALVERON_WEBHOOK_TOKEN" \
  --header "Accept: application/json" \
  "$API_BASE/api/webhook/company-intelligence-discovery"
