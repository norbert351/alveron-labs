#!/usr/bin/env bash
# 25-company evaluation batch (phase 11). Uses webhook endpoint.
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
  "Cold Stone Creamery|www.coldstonecreamery.com"
  "Marco's Pizza|www.marcos.com"
  "Buffalo Wild Wings|www.buffalowildwings.com"
  "Anytime Fitness|www.anytimefitness.com"
  "Firehouse Subs|www.firehousesubs.com"
  "Taco Bell|www.tacobell.com"
  "The Cheesecake Factory|www.thecheesecakefactory.com"
  "Hooters|www.hooters.com"
  "F45 Training|www.f45training.com"
  "Crunch Fitness|www.crunch.com"
  "European Wax Center|www.waxcenter.com"
  "Jiffy Lube|www.jiffylube.com"
  "Valvoline|www.valvoline.com"
  "FTD|www.ftd.com"
  "Edible Arrangements|www.ediblearrangements.com"
  "Dickey's Barbecue Pit|www.dickeys.com"
)

echo "=== Submitting $(( ${#COMPANIES[@]} )) companies ==="
for entry in "${COMPANIES[@]}"; do
  name="${entry%%|*}"
  site="${entry##*|}"
  resp=$(curl -s -m 20 -X POST -H "X-Webhook-Key: $ALVERON_WEBHOOK_TOKEN" -H "Content-Type: application/json" \
    -d "{\"name\":\"$name\",\"website\":\"$site\",\"notes\":\"phase11 evaluation batch\"}" "$API/api/webhook/company")
  cid=$(echo "$resp" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('company',{}).get('id',''))" 2>/dev/null)
  dup=$(echo "$resp" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('duplicate',''))" 2>/dev/null)
  echo "  $name -> id=$cid dup=$dup"
  if [ "$dup" = "True" ] && [ -n "$cid" ]; then
    curl -s -m 20 -X POST -H "Authorization: Bearer $ALVERON_INTERNAL_TOKEN" -H "Content-Type: application/json" \
      -d '{}' "$API/api/companies/$cid/reanalyze" -o /dev/null -w "    reanalyze %{http_code}\n"
  fi
done

echo "=== Waiting for all jobs ==="
python3 << 'PYEOF'
import json, time, urllib.request, urllib.error

API = "http://127.0.0.1:3100"
env = open(".env").read()
TOKEN = env.split("ALVERON_INTERNAL_TOKEN=")[1].split("\n")[0].strip()

def get(path):
    req = urllib.request.Request(API + path, headers={"Authorization": "Bearer " + TOKEN})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

deadline = time.time() + 9000
while time.time() < deadline:
    d = get("/api/companies")
    jobs = []
    for c in d["companies"]:
        try:
            detail = get(f"/api/companies/{c['id']}")
        except Exception:
            continue
        j = detail.get("job")
        if j: jobs.append((c["name"], j["status"]))
    running = [x for x in jobs if x[1] in ("pending", "running")]
    completed = [x for x in jobs if x[1] == "completed"]
    failed = [x for x in jobs if x[1] == "failed"]
    print(f"  poll: running={len(running)} completed={len(completed)} failed={len(failed)}", flush=True)
    if not running:
        break
    time.sleep(30)

result = []
for c in get("/api/companies")["companies"]:
    try:
        detail = get(f"/api/companies/{c['id']}")
    except Exception:
        continue
    result.append({
        "id": c["id"], "name": c["name"], "website": c["website"],
        "status": c["status"], "stage": c["stage"], "industry": c["industry"],
        "job": (detail.get("job") or {}).get("status"),
        "opportunities": len(detail.get("opportunities") or []),
        "scored": sum(1 for o in (detail.get("opportunities") or []) if o.get("score") is not None),
        "high": sum(1 for o in (detail.get("opportunities") or []) if (o.get("score") or 0) >= 80),
        "medium": sum(1 for o in (detail.get("opportunities") or []) if 60 <= (o.get("score") or 0) < 80),
        "low": sum(1 for o in (detail.get("opportunities") or []) if (o.get("score") or 0) < 60),
    })
json.dump(result, open("/tmp/alveron_batch25_result.json", "w"), indent=2)
print("=== DONE ===")
for r in result:
    print(f"  {r['name']}: job={r['job']} opps={r['opportunities']} scored={r['scored']} H/M/L={r['high']}/{r['medium']}/{r['low']}")
PYEOF
