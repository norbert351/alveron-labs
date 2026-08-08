#!/usr/bin/env bash
# Re-import (update) a workflow via the public API, then ensure it is active.
set -u
KEY=$(cat /tmp/n8n_api_key.txt)
N8N="http://127.0.0.1:5678"
WF_ID="${1:-W3Os6KyY8hETiW4D}"
WF_FILE="${2:-alveron-company-analysis.json}"
cd "$(dirname "$0")/../n8n/workflows"

# deactivate via editor API (public API cannot touch active)
curl -s -m 20 -X POST "$N8N/rest/workflows/$WF_ID/deactivate" -b /tmp/n8n_cookies.txt \
  -H "Content-Type: application/json" -d '{}' -o /dev/null -w "deactivate HTTP %{http_code}\n"

python3 -c "
import json
d = json.load(open('$WF_FILE'))
d.pop('active', None)
print(json.dumps(d))
" > /tmp/n8n_wf_body.json

curl -s -m 20 -X PATCH -H "X-N8N-API-KEY: $KEY" -H "Content-Type: application/json" \
  -d @/tmp/n8n_wf_body.json "$N8N/api/v1/workflows/$WF_ID" -o /tmp/n8n_update.json -w "update HTTP %{http_code}\n"
python3 -c "
import json
d = json.load(open('/tmp/n8n_update.json'))
print('  name:', d.get('name'), '| nodes:', len(d.get('nodes', [])))
" 2>/dev/null || head -c 200 /tmp/n8n_update.json

# activate with versionId (editor API requirement)
VID=$(curl -s -m 20 "$N8N/rest/workflows/$WF_ID" -b /tmp/n8n_cookies.txt | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['versionId'])")
curl -s -m 20 -X POST "$N8N/rest/workflows/$WF_ID/activate" -b /tmp/n8n_cookies.txt \
  -H "Content-Type: application/json" -d "{\"versionId\":\"$VID\"}" -o /tmp/n8n_act.json -w "activate HTTP %{http_code}\n"
python3 -c "import json; d=json.load(open('/tmp/n8n_act.json')); print('  active:', d.get('data',{}).get('active'))" 2>/dev/null || head -c 150 /tmp/n8n_act.json
