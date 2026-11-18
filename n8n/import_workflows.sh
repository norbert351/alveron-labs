#!/usr/bin/env bash
# Import the maintained Alveron workflows into a running self-hosted n8n instance.
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
WORKFLOWS_DIR="$SCRIPT_DIR/workflows"
N8N_BASE_URL="${N8N_BASE_URL:-http://127.0.0.1:5678}"

: "${N8N_API_KEY:?Set N8N_API_KEY to an n8n public API key before importing workflows}"

WORKFLOWS=(
  alveron-company-analysis.json
  alveron-lead-discovery.json
  alveron-email-send.json
  alveron-follow-up.json
  alveron-opportunity-discovery.json
  alveron-daily-opportunity-briefing.json
)

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

for filename in "${WORKFLOWS[@]}"; do
  file="$WORKFLOWS_DIR/$filename"
  if [[ ! -f "$file" ]]; then
    echo "Missing workflow file: $file" >&2
    exit 1
  fi

  echo "== importing $filename =="
  python3 - "$file" "$TMP_DIR/workflow.json" <<'PY'
import json
import sys
with open(sys.argv[1], encoding="utf-8") as source:
    workflow = json.load(source)
workflow.pop("active", None)
with open(sys.argv[2], "w", encoding="utf-8") as target:
    json.dump(workflow, target)
PY

  response_file="$TMP_DIR/response.json"
  status="$(curl --silent --show-error --output "$response_file" --write-out '%{http_code}' \
    --max-time 30 --request POST \
    --header "X-N8N-API-KEY: $N8N_API_KEY" \
    --header "Content-Type: application/json" \
    --data-binary "@$TMP_DIR/workflow.json" \
    "$N8N_BASE_URL/api/v1/workflows")"

  if [[ "$status" != "200" && "$status" != "201" ]]; then
    echo "Import failed for $filename (HTTP $status):" >&2
    cat "$response_file" >&2
    exit 1
  fi

  python3 - "$response_file" <<'PY'
import json
import sys
with open(sys.argv[1], encoding="utf-8") as source:
    result = json.load(source)
workflow = result.get("data", result)
print(f"Imported: {workflow.get('name', 'unknown')} (id: {workflow.get('id', 'unknown')})")
PY
done

echo "Import complete. Review each workflow in the n8n editor and activate only the workflows you intend to run."
