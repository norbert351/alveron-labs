#!/usr/bin/env bash
# Activate the Company Analysis workflow and fire its webhook with a fresh company.
set -u
KEY=$(cat /tmp/n8n_api_key.txt)
N8N="http://127.0.0.1:5678"
WF_ID="W3Os6KyY8hETiW4D"

echo "== activating workflow =="
curl -s -m 15 -X PATCH -H "X-N8N-API-KEY: $KEY" -H "Content-Type: application/json" \
  -d '{"active": true}' "$N8N/api/v1/workflows/$WF_ID" -o /tmp/n8n_activate.json -w "HTTP %{http_code}\n"
python3 -c "import json; d=json.load(open('/tmp/n8n_activate.json')); print('active:', d.get('active'))" 2>/dev/null

echo "== firing webhook (analysis runs, may take minutes) =="
curl -s -m 590 -X POST -H "Content-Type: application/json" \
  -d '{"name":"Cold Stone Creamery","website":"www.coldstonecreamery.com","notes":"n8n e2e test"}' \
  "$N8N/webhook/alveron-company" -o /tmp/n8n_webhook_resp.json -w "webhook HTTP %{http_code}\n"
head -c 500 /tmp/n8n_webhook_resp.json; echo

echo "== recent workflow runs (n8n side) =="
curl -s -m 15 -H "X-N8N-API-KEY: $KEY" "$N8N/api/v1/executions?limit=3&includeData=false" -o /tmp/n8n_execs.json -w "HTTP %{http_code}\n"
python3 -c "
import json
d = json.load(open('/tmp/n8n_execs.json'))
for e in d.get('data', []):
    print(' ', e.get('id'), e.get('workflowId'), e.get('status'), e.get('startedAt'))
" 2>/dev/null || head -c 200 /tmp/n8n_execs.json
