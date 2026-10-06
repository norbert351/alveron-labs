#!/usr/bin/env bash
# Import the 8 research-engine n8n workflows via the public API.
# Usage: bash n8n/import_research_workflows.sh [HOST] [KEY]
# If KEY is omitted it is read from the local n8n sqlite DB (user_api_keys table).
set -euo pipefail
HOST="${1:-http://127.0.0.1:5678}"
KEY="${2:-}"
if [ -z "$KEY" ]; then
  KEY=$(sqlite3 /home/ubuntu/.n8n/database.sqlite "SELECT apiKey FROM user_api_keys LIMIT 1;" 2>/dev/null || true)
fi
DIR="$(cd "$(dirname "$0")" && pwd)"
API="$HOST/api/v1/workflows"

import_one() {
  local json="$1"
  local meta
  meta=$(python3 -c "import json,sys; d=json.load(open('$json')); d.pop('active',None); print(json.dumps(d))")
  curl -s -o /tmp/n8n_imp.json -w "%{http_code}" -X POST "$API" \
    -H "X-N8N-API-KEY: $KEY" -H "Content-Type: application/json" -d "$meta"
  echo -n " -> "
  python3 -c "import json;d=json.load(open('/tmp/n8n_imp.json'));print(d.get('name','ERR'), '| id', d.get('id', d.get('message','?')))" 2>/dev/null || cat /tmp/n8n_imp.json | head -c 200
  echo ""
}

echo "Importing research-engine workflows into $HOST..."
for f in "$DIR"/workflows/research-global-business-discovery.json "$DIR"/workflows/research-company-enrichment.json "$DIR"/workflows/research-website-crawl.json "$DIR"/workflows/research-signal-extraction.json "$DIR"/workflows/research-ai-problem-detection.json "$DIR"/workflows/research-opportunity-detection.json "$DIR"/workflows/research-solution-recommendation.json "$DIR"/workflows/research-pipeline-coordinator.json; do
  echo "[$(basename "$f")]"
  import_one "$f"
done
echo "done."