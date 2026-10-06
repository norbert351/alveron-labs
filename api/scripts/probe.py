#!/usr/bin/env python3
"""Small helper to call the Alveron research API without exposing secrets in shell history."""
import json, os, sys, urllib.request, time

ENV = os.path.expanduser("~/alveron-labs/api/.env")
tok = ""
with open(ENV) as f:
    for line in f:
        if line.startswith("ALVERON_INTERNAL_TOKEN="):
            tok = line.split("=", 1)[1].strip()
WEBHOOK = ""
with open(ENV) as f:
    for line in f:
        if line.startswith("ALVERON_WEBHOOK_TOKEN="):
            WEBHOOK = line.split("=", 1)[1].strip()

BASE = "http://127.0.0.1:3100"

def call(method, path, body=None, webhook=False):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if webhook:
        req.add_header("X-Webhook-Key", WEBHOOK)
    else:
        req.add_header("Authorization", "Bearer " + tok)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:400]

if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "meta":
        print(json.dumps(call("GET", "/api/research/meta")[1], indent=2)[:3000])
    elif cmd == "start":
        body = json.loads(sys.argv[2])
        s, b = call("POST", "/api/webhook/research/run", body, webhook=True)
        print(s, json.dumps(b))
    elif cmd == "status":
        s, b = call("GET", f"/api/webhook/research/status/{sys.argv[2]}", webhook=True)
        print(s, json.dumps(b, indent=2)[:2500])
    elif cmd == "run":
        s, b = call("GET", f"/api/research/runs/{sys.argv[2]}")
        print(s, json.dumps(b, indent=2)[:6000])
    elif cmd == "company":
        s, b = call("GET", f"/api/research/companies/{sys.argv[2]}")
        print(s, json.dumps(b, indent=2)[:6000])
