# Company intelligence cron runner

This scheduler uses the Linux cron daemon and curl. It is the fully open-source
scheduling option and does not depend on n8n.

Install the runner from the repository root:

```bash
sudo install -d -m 700 /etc/alveron
sudo install -m 700 scripts/run-company-intelligence.sh /usr/local/bin/alveron-company-intelligence
sudo sh -c 'cat > /etc/alveron/company-intelligence.env <<EOF
ALVERON_API_BASE=http://127.0.0.1:3100
ALVERON_WEBHOOK_TOKEN=REPLACE_WITH_THE_API_WEBHOOK_TOKEN
EOF'
sudo chmod 600 /etc/alveron/company-intelligence.env
```

Add a daily schedule at 04:15 server time:

```cron
15 4 * * * /usr/local/bin/alveron-company-intelligence >> /var/log/alveron-company-intelligence.log 2>&1
```

The API must be running and configured with `ALVERON_SEARXNG_URL`. For local AI summaries, start the optional Ollama profile and set `ALVERON_COMPANY_INTELLIGENCE_LLM_URL=http://127.0.0.1:11434/v1` plus `ALVERON_COMPANY_INTELLIGENCE_LLM_MODEL=qwen2.5:1.5b` in the API environment. Start the
SearXNG service from `research/` as described in
`docs/COMPANY_INTELLIGENCE.md`. The batch discovers public startup candidates
and investigates up to ten existing company records per run. It only collects
evidence. It does not promote candidates, generate outreach, or contact anyone.

Use either this cron runner or the optional n8n workflow for scheduling. Do not
enable both at the same time unless you deliberately want duplicate runs.
