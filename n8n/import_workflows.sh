#!/usr/bin/env bash
# Import Alveron workflows into the local n8n instance.
set -u
KEY=$(cat /tmp/n8n_api_key.txt)
N8N="http://127.0.0.1:5678"
cd "$(dirname "$0")/../n8n/workflows"

echo "== existing workflows =="
curl -s -m 10 -H "X-N8N-API-KEY: $KEY" "$N8N/api/v1/workflows" | python3 -c "
import json, sys
d = json.load(sys.stdin)
for w in d.get('data', []): print(' ', w.get('id'), w.get('name'), 'active:', w.get('active'))
print('count:', len(d.get('data', [])))
"

for f in alveron-company-analysis.json alveron-lead-discovery.json alveron-email-send.json alveron-follow-up.json; do
  echo "== importing $f =="
  python3 -c "
import json
d = json.load(open('$f'))
d.pop('active', None)
print(json.dumps(d))
" > /tmp/n8n_wf_body.json
  curl -s -m 20 -X POST -H "X-N8N-API-KEY: $KEY" -H "Content-Type: application/json" \
    -d @/tmp/n8n_wf_body.json "$N8N/api/v1/workflows" -o /tmp/n8n_import.json -w "HTTP %{http_code}\n"
  python3 -c "
import json
d = json.load(open('/tmp/n8n_import.json'))
if 'data' in d and d['data']:
    w = d['data']
    print('  imported:', w.get('id'), w.get('name'), '| nodes:', len(w.get('nodes', [])))
else:
    print('  error:', json.dumps(d)[:200])
"
done
