#!/usr/bin/env bash
# 10-company evaluation batch for Alveron phase 2.
# Uses the n8n-facing webhook endpoint (auth via X-Webhook-Key).
set -u
cd "$(dirname "$0")"
API="http://127.0.0.1:3100"
set -a; source .env; set +a

COMPANIES=(
  "Truefitt and Hill|truefittandhill.com"
  "IKEA|www.ikea.com"
  "Jersey Mike's|www.jerseymikes.com"
  "Sweetgreen|www.sweetgreen.com"
  "Orangetheory Fitness|www.orangetheory.com"
  "Meineke Car Care|www.meineke.com"
  "Massage Envy|www.massageenvy.com"
  "Wyndham Hotels|www.wyndhamhotels.com"
  "Two Men and a Truck|www.twomenandatruck.com"
  "Papa John's|www.papajohns.com"
)

echo "=== Submitting batch ==="
for entry in "${COMPANIES[@]}"; do
  name="${entry%%|*}"
  site="${entry##*|}"
  resp=$(curl -s -m 20 -X POST -H "X-Webhook-Key: $ALVERON_WEBHOOK_TOKEN" -H "Content-Type: application/json" \
    -d "{\"name\":\"$name\",\"website\":\"$site\",\"notes\":\"phase2 evaluation batch\"}" "$API/api/webhook/company")
  cid=$(echo "$resp" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('company',{}).get('id',''))" 2>/dev/null)
  dup=$(echo "$resp" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('duplicate',''))" 2>/dev/null)
  echo "  $name -> company_id=$cid duplicate=$dup"
  if [ "$dup" = "True" ] && [ -n "$cid" ]; then
    # existing company with finished job: re-analyze it
    curl -s -m 20 -X POST -H "Authorization: Bearer $ALVERON_INTERNAL_TOKEN" -H "Content-Type: application/json" \
      -d '{}' "$API/api/companies/$cid/reanalyze" -o /dev/null -w "    reanalyze HTTP %{http_code}\n" 2>/dev/null
  fi
done

echo "=== Waiting for all jobs to finish ==="
python3 << 'PYEOF'
import json, time, urllib.request

API = "http://127.0.0.1:3100"
TOKEN = open(".env").read().split("ALVERON_INTERNAL_TOKEN=")[1].split("\n")[0].strip()
WEBHOOK = open(".env").read().split("ALVERON_WEBHOOK_TOKEN=")[1].split("\n")[0].strip()

def get(path, key=None):
    req = urllib.request.Request(API + path)
    if key == 'internal':
        req.add_header("Authorization", f"Bearer {TOKEN}")
    else:
        req.add_header("X-Webhook-Key", WEBHOOK)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

deadline = time.time() + 5400  # 90 min max
while time.time() < deadline:
    d = get("/api/companies", 'internal')
    companies = d["companies"]
    active = [c for c in companies if c["status"] in ("new", "researched")]
    jobs = []
    for c in companies:
        detail = get(f"/api/companies/{c['id']}", 'internal')
        j = detail.get("job")
        if j: jobs.append((c["name"], j["status"]))
    running = [x for x in jobs if x[1] in ("pending", "running")]
    failed = [x for x in jobs if x[1] == "failed"]
    completed = [x for x in jobs if x[1] == "completed"]
    print(f"  poll: running={len(running)} completed={len(completed)} failed={len(failed)}")
    if not running:
        break
    time.sleep(30)

result = []
for c in get("/api/companies", 'internal')["companies"]:
    detail = get(f"/api/companies/{c['id']}", 'internal')
    result.append({
        "id": c["id"], "name": c["name"], "website": c["website"], "status": c["status"],
        "stage": c["stage"], "industry": c["industry"], "job": (detail.get("job") or {}).get("status"),
        "opportunities": len(detail.get("opportunities") or []),
        "scored": sum(1 for o in (detail.get("opportunities") or []) if o.get("score") is not None),
    })
json.dump(result, open("/tmp/alveron_batch_result.json", "w"), indent=2)
print("=== DONE ===")
for r in result:
    print(f"  {r['name']}: job={r['job']} status={r['status']} opps={r['opportunities']} scored={r['scored']} industry={r['industry']}")
PYEOF
