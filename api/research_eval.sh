#!/usr/bin/env bash
# Evaluation runner (spec §31): run a batch across diverse industries/countries,
# wait for completion, then print H/M/L opportunity distribution + quality stats.
# Usage: bash api/research_eval.sh '<JSON input>' [runs]
set -euo pipefail
cd "$(dirname "$0")"
TOKEN=$(grep -oP '^ALVERON_INTERNAL_TOKEN=\K.*' .env)
BASE=http://127.0.0.1:3100
INPUT="${1:-{\"industry\":\"restaurants\",\"country\":\"United States\",\"region\":\"California\",\"count\":8}}"
N="${2:-1}"

run_one() {
  local body="$1" rid date
  date=$(date +%s)
  rid=$(curl -s -X POST "$BASE/api/research/runs" -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" -d "$body" | python3 -c "import sys,json;print(json.load(sys.stdin)['run']['run_id'])")
  echo "started $rid"
  # poll until terminal
  local st=running
  while [ "$st" = running ] || [ "$st" = pending ]; do
    sleep 12
    st=$(curl -s "$BASE/api/research/runs/$rid" -H "Authorization: Bearer $TOKEN" \
      | python3 -c "import sys,json;print(json.load(sys.stdin)['run']['status'])")
  done
  echo "== $rid -> $st =="
  curl -s "$BASE/api/research/runs/$rid" -H "Authorization: Bearer $TOKEN" \
    | python3 -c "
import sys,json
d=json.load(sys.stdin)
r=d['run']; res=d['results']
stat=r.get('statistics',{})
print('stats:', json.dumps(stat))
print('companies:', len(res))
opens=[r for r in res if r['opportunities_count']>0]
print('companies_with_opportunities:', len(opens))
print(json.dumps([{'name':r['company_name'],'outcome':r['outcome'],'problems':r['problems_count'],'opps':r['opportunities_count']} for r in res], indent=1))
"
}

echo "Evaluating $N run(s) with input: $INPUT"
for i in $(seq 1 "$N"); do run_one "$INPUT"; done
echo "eval complete"