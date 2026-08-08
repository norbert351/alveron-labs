#!/usr/bin/env bash
# Alveron phase-2 smoke test
set -u
cd "$(dirname "$0")"
API="http://127.0.0.1:3100"

# load env without printing secrets
set -a
source .env
set +a

echo "== 1. valid internal token =="
curl -s -m 10 -H "Authorization: Bearer $ALVERON_INTERNAL_TOKEN" "$API/api/companies" -o /tmp/t1.json -w "HTTP %{http_code}\n"
python3 -c "import json; d=json.load(open('/tmp/t1.json')); print('companies:', len(d['companies']))"

echo "== 2. valid webhook key =="
curl -s -m 10 -H "X-Webhook-Key: $ALVERON_WEBHOOK_TOKEN" "$API/api/webhook/follow-up-config" -o /tmp/t2.json -w "HTTP %{http_code}\n"
head -c 120 /tmp/t2.json; echo

echo "== 3. SSRF block: internal URL (expect 400) =="
curl -s -m 15 -X POST -H "Authorization: Bearer $ALVERON_INTERNAL_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"SSRF Test","website":"http://127.0.0.1:5433/postgres"}' "$API/api/companies" -o /tmp/t3.json -w "HTTP %{http_code}\n"
head -c 150 /tmp/t3.json; echo

echo "== 4. SSRF block: localhost (expect 400) =="
curl -s -m 15 -X POST -H "Authorization: Bearer $ALVERON_INTERNAL_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"SSRF Test 2","website":"http://localhost:3000"}' "$API/api/companies" -o /tmp/t4.json -w "HTTP %{http_code}\n"
head -c 150 /tmp/t4.json; echo

echo "== 5. duplicate company (Truefitt, expect 409) =="
curl -s -m 15 -X POST -H "Authorization: Bearer $ALVERON_INTERNAL_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Truefitt and Hill","website":"truefittandhill.com"}' "$API/api/companies" -o /tmp/t5.json -w "HTTP %{http_code}\n"
head -c 200 /tmp/t5.json; echo

echo "== 6. webhook create company (expect 201) =="
curl -s -m 15 -X POST -H "X-Webhook-Key: $ALVERON_WEBHOOK_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Smoke Test Co","website":"www.ikea.com","notes":"phase2 smoke"}' "$API/api/webhook/company" -o /tmp/t6.json -w "HTTP %{http_code}\n"
head -c 200 /tmp/t6.json; echo

echo "== 7. leads batch with duplicate (expect dedupe) =="
curl -s -m 15 -X POST -H "X-Webhook-Key: $ALVERON_WEBHOOK_TOKEN" -H "Content-Type: application/json" \
  -d '{"source":"test-csv","items":[{"name":"Lead A","website":"www.mini.de","industry":"SaaS","location":"UK"},{"name":"Lead A","website":"leada.example.com"},{"name":"Truefitt and Hill","website":"truefittandhill.com"}]}' \
  "$API/api/webhook/leads" -o /tmp/t7.json -w "HTTP %{http_code}\n"
python3 -c "import json; d=json.load(open('/tmp/t7.json')); print('created:', d['created'], 'duplicates:', d['duplicates'])"

echo "== 8. workflow run record (expect 201) =="
curl -s -m 10 -X POST -H "X-Webhook-Key: $ALVERON_WEBHOOK_TOKEN" -H "Content-Type: application/json" \
  -d '{"workflow_name":"Company Analysis","status":"started","trigger":"webhook","retry_count":0}' \
  "$API/api/webhook/workflow-run" -o /tmp/t8.json -w "HTTP %{http_code}\n"
head -c 150 /tmp/t8.json; echo

echo "== 9. workflow runs list =="
curl -s -m 10 -H "Authorization: Bearer $ALVERON_INTERNAL_TOKEN" "$API/api/workflow-runs" -o /tmp/t9.json -w "HTTP %{http_code}\n"
python3 -c "import json; d=json.load(open('/tmp/t9.json')); print('runs:', len(d['runs']))"
