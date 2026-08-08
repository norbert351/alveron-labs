#!/usr/bin/env bash
# Reimport a workflow by name: delete existing (by name lookup) + create + activate.
set -u
KEY=$(cat /tmp/n8n_api_key.txt)
N8N="http://127.0.0.1:5678"
WF_FILE="${1:-alveron-email-send.json}"
cd "$(dirname "$0")/../n8n/workflows"

NAME=$(python3 -c "import json; print(json.load(open('$WF_FILE'))['name'])")
echo "== reimporting: $NAME =="

# find existing by name and delete
EXISTING=$(curl -s -m 15 -H "X-N8N-API-KEY: $KEY" "$N8N/api/v1/workflows" | python3 -c "
import json, sys
for w in json.load(sys.stdin).get('data', []):
    if w.get('name') == '$NAME': print(w.get('id'))
")
for wid in $EXISTING; do
  curl -s -m 15 -X DELETE -H "X-N8N-API-KEY: $KEY" "$N8N/api/v1/workflows/$wid" -o /dev/null -w "  deleted $wid HTTP %{http_code}\n"
done

python3 -c "
import json
d = json.load(open('$WF_FILE'))
d.pop('active', None)
print(json.dumps(d))
" > /tmp/n8n_wf_body.json

curl -s -m 20 -X POST -H "X-N8N-API-KEY: $KEY" -H "Content-Type: application/json" \
  -d @/tmp/n8n_wf_body.json "$N8N/api/v1/workflows" -o /tmp/n8n_import_new.json -w "  create HTTP %{http_code}\n"
NEWID=$(python3 -c "import json; print(json.load(open('/tmp/n8n_import_new.json')).get('id',''))")
echo "  new id: $NEWID"

if [ -n "$NEWID" ]; then
  VID=$(curl -s -m 20 "$N8N/rest/workflows/$NEWID" -b /tmp/n8n_cookies.txt | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['versionId'])")
  curl -s -m 20 -X POST "$N8N/rest/workflows/$NEWID/activate" -b /tmp/n8n_cookies.txt \
    -H "Content-Type: application/json" -d "{\"versionId\":\"$VID\"}" -o /tmp/n8n_act_new.json -w "  activate HTTP %{http_code}\n"
  python3 -c "import json; print('  active:', json.load(open('/tmp/n8n_act_new.json'))['data']['active'])" 2>/dev/null
fi
