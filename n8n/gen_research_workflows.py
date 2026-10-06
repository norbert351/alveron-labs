#!/usr/bin/env python3
"""Generate the 8 Alveron research-engine n8n workflows.

Design (honest): the API owns the pipeline stages and persists all state; n8n
provides scheduling, triggers, retries, approval and polling. Each numbered
workflow triggers the matching pipeline segment on the Alveron API via webhooks
(X-Webhook-Key). See docs/RESEARCH_ENGINE.md.

Env vars the workflows read at runtime (require N8N_BLOCK_ENV_ACCESS_IN_NODE=false):
  ALVERON_API_BASE   e.g. http://127.0.0.1:3100
  ALVERON_WEBHOOK_TOKEN
"""
import json, os

OUT = os.path.join(os.path.dirname(__file__), "workflows")
os.makedirs(OUT, exist_ok=True)

node_id = {"n": 0}
def nid():
    node_id["n"] += 1
    return f"n{node_id['n']}"

def webhook(name, path, method="POST"):
    return {
        "parameters": {"path": path, "httpMethod": method, "responseMode": "lastNode", "options": {}},
        "id": nid(), "name": name, "type": "n8n-nodes-base.webhook",
        "typeVersion": 2, "position": [0, 0],
    }

def manual(name="Start", label=""):
    return {
        "parameters": {"notice": label or name},
        "id": nid(), "name": name, "type": "n8n-nodes-base.manualTrigger", "typeVersion": 1, "position": [0, 0],
    }

def hreq(name, method, url_expr, json_expr, auth, never_error=False, timeout=120):
    opts = {"response": {"response": {"neverError": never_error}}} if never_error else {}
    params = {"url": url_expr, "method": method, "sendBody": True}
    if json_expr is not None:
        params["jsonBody"] = json_expr
    if auth == "webhook":
        params["headerParameters"] = {"parameters": [
            {"name": "X-Webhook-Key", "value": "={{ $env.ALVERON_WEBHOOK_TOKEN }}"},
            {"name": "Content-Type", "value": "application/json"},
        ]}
    if timeout:
        params["options"] = {"timeout": timeout}
    return {
        "parameters": params,
        "id": nid(), "name": name, "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2, "position": [0, 0],
    }

def ifnode(name, condition):
    return {
        "parameters": {"conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose"},
            "conditions": [{"leftValue": condition, "rightValue": "", "operator": {"type": "boolean", "operation": "true"},
                            "options": {"ignoreCase": True}}]}},
        "id": nid(), "name": name, "type": "n8n-nodes-base.if", "typeVersion": 2.2, "position": [0, 0],
    }

def stoptime():
    return {"parameters": {}, "id": nid(), "name": "Done", "type": "n8n-nodes-base.stopAndError", "typeVersion": 1, "position": [0, 0]}

def emit(name, nodes, connections, extra=None):
    wf = {
        "name": name, "active": False, "nodes": nodes, "connections": connections,
        "settings": {"executionOrder": "v1"},
    }
    if extra:
        wf.update(extra)
    safe = "".join(c for c in name if c.isalnum() or c in "-_").lower().lstrip("-")
    if safe.startswith("research-"):
        safe = safe[len("research-"):]
    with open(os.path.join(OUT, f"research-{safe}.json"), "w") as f:
        json.dump(wf, f, indent=2)

BASE = "={{ $env.ALVERON_API_BASE }}/api/webhook/research"

# WF1 — Global Business Discovery
h = webhook("Discovery Trigger", "research/discover")
r = hreq("Discover Businesses", "POST", f"{BASE}/discover",
         "={{ JSON.stringify({ run_id: $json.body?.run_id || null, country: $json.body?.country, region: $json.body?.region, city: $json.body?.city, industry: $json.body?.industry, language: $json.body?.language, count: $json.body?.count || 20, force: $json.body?.force, wait: true }) }}",
         "webhook", never_error=True)
emit("research-global-business-discovery",
     [h, r],
     {"Discovery Trigger": {"main": [[{"node": "Discover Businesses", "type": "main", "index": 0}]]}})

# WF2 — Company Enrichment
h2 = webhook("Enrichment Trigger", "research/enrich")
r2 = hreq("Enrich Companies", "POST", f"{BASE}/discover",
          "={{ JSON.stringify({ run_id: $json.body?.run_id }) }}", "webhook", never_error=True)
emit("research-company-enrichment", [h2, r2],
     {"Enrichment Trigger": {"main": [[{"node": "Enrich Companies", "type": "main", "index": 0}]]}})

# WF3 — Website Crawl (per company)
h3 = webhook("Crawl Trigger", "research/company/crawl")
r3 = hreq("Crawl Website", "POST", f"{BASE}/company/crawl",
          "={{ JSON.stringify({ run_id: $json.body?.run_id, company_id: $json.body?.company_id }) }}", "webhook", never_error=True)
emit("research-website-crawl", [h3, r3],
     {"Crawl Trigger": {"main": [[{"node": "Crawl Website", "type": "main", "index": 0}]]}})

# WF4 — Signal Extraction (bundled with crawl; re-runs idempotently)
h4 = webhook("Signals Trigger", "research/signals")
r4 = hreq("Extract Signals", "POST", f"{BASE}/company/crawl",
          "={{ JSON.stringify({ run_id: $json.body?.run_id, company_id: $json.body?.company_id }) }}", "webhook", never_error=True)
emit("research-signal-extraction", [h4, r4],
     {"Signals Trigger": {"main": [[{"node": "Extract Signals", "type": "main", "index": 0}]]}})

# WF5 — AI Problem Detection
h5 = webhook("AI Problems Trigger", "research/analyze")
r5 = hreq("Detect Problems", "POST", f"{BASE}/company/analyze",
          "={{ JSON.stringify({ run_id: $json.body?.run_id, company_id: $json.body?.company_id }) }}", "webhook", never_error=True)
emit("research-ai-problem-detection", [h5, r5],
     {"AI Problems Trigger": {"main": [[{"node": "Detect Problems", "type": "main", "index": 0}]]}})

# WF6 — Opportunity Detection
h6 = webhook("Opportunity Trigger", "research/opportunities")
r6 = hreq("Detect Opportunities", "POST", f"{BASE}/company/analyze",
          "={{ JSON.stringify({ run_id: $json.body?.run_id, company_id: $json.body?.company_id }) }}", "webhook", never_error=True)
emit("research-opportunity-detection", [h6, r6],
     {"Opportunity Trigger": {"main": [[{"node": "Detect Opportunities", "type": "main", "index": 0}]]}})

# WF7 — Solution Recommendation (scoring + recommendation, bundled)
h7 = webhook("Recommend Trigger", "research/recommend")
r7 = hreq("Recommend Services", "POST", f"{BASE}/company/analyze",
          "={{ JSON.stringify({ run_id: $json.body?.run_id, company_id: $json.body?.company_id }) }}", "webhook", never_error=True)
emit("research-solution-recommendation", [h7, r7],
     {"Recommend Trigger": {"main": [[{"node": "Recommend Services", "type": "main", "index": 0}]]}})

# WF8 — Research Pipeline Coordinator: start a run, then poll until done
h8 = webhook("Coordinator Trigger", "research/coordinator")
r8 = hreq("Start Research Run", "POST", f"{BASE}/run",
          "={{ JSON.stringify({ country: $json.body?.country, region: $json.body?.region, city: $json.body?.city, industry: $json.body?.industry, language: $json.body?.language, count: $json.body?.count || 20, force: $json.body?.force }) }}",
          "webhook", never_error=True)
# poll status
poll = hreq("Check Status", "GET",
            f"{BASE}/status/={{ $json.code === 201 ? $json.body.run_id : $json.run_id }}", None, "webhook", never_error=True)
ifn = ifnode("Is Complete", "={{ Array.isArray($json.run) && ['completed','failed','partial'].includes($json.run.status) }}")
done = stoptime()
emit("research-pipeline-coordinator", [h8, r8, poll, ifn, done], {
    "Coordinator Trigger": {"main": [[{"node": "Start Research Run", "type": "main", "index": 0}]]},
    "Start Research Run": {"main": [[{"node": "Check Status", "type": "main", "index": 0}]]},
    "Check Status": {"main": [[{"node": "Is Complete", "type": "main", "index": 0}]]},
    "Is Complete": {"main": [[{"node": "Done", "type": "main", "index": 0}]]},
})

print("Generated", len([f for f in os.listdir(OUT) if f.startswith('research-')]), "workflows in", OUT)