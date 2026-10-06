#!/usr/bin/env bash
# Headless n8n owner setup + API key creation (idempotent-ish).
set -euo pipefail
HOST="${1:-http://127.0.0.1:5678}"
EMAIL="alveron@afterhourequity.local"
PASS="${ALVERON_N8N_PW:-Alver0n!Research#2026}"
CJ=/tmp/n8n_cookies.txt

rm -f "$CJ"

echo "owner setup..."
code=$(curl -s -o /tmp/n8n_setup.json -w "%{http_code}" -X POST "$HOST/rest/owner/setup" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"firstName\":\"Alveron\",\"lastName\":\"Research\",\"password\":\"$PASS\"}" -c "$CJ")
echo "  setup http $code; body=$(head -c 160 /tmp/n8n_setup.json)"

# If already set up, just log in.
if [ "$code" != "200" ]; then
  echo "login (existing owner)..."
  curl -s -o /dev/null -X POST "$HOST/rest/login" -H "Content-Type: application/json" \
    -d "{\"emailOrLdapLoginId\":\"$EMAIL\",\"password\":\"$PASS\"}" -c "$CJ"
fi

FUTURE=$(python3 -c "import time; print(int(time.time()*1000)+31536000000)")
echo "create api key..."
curl -s -X POST "$HOST/rest/api-keys" -b "$CJ" -H "Content-Type: application/json" \
  -d "{\"label\":\"alveron-research\",\"expiresAt\":$FUTURE,\"scopes\":[\"workflow:create\",\"workflow:update\",\"workflow:read\",\"workflow:list\",\"workflow:delete\",\"execution:list\",\"execution:read\"]}" > /tmp/n8n_apikey.json
python3 -c "import json; d=json.load(open('/tmp/n8n_apikey.json')); k=d.get('data',{}).get('rawApiKey',''); print('RAW_API_KEY='+k if k else 'KEYLOOKUP='+json.dumps(d)[:200])"