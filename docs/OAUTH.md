# OAuth Setup — Real Email Providers

The EmailProvider abstraction is fully implemented (`GmailProvider`,
`MicrosoftGraphProvider`, `ResendProvider`). What is missing to complete a
**real** connection is your application registration. Nothing is faked: until
the credentials below exist, the Connect buttons return a clear configuration
error and no mailbox can be attached.

## 1. Gmail / Google Workspace (priority 1)

### Google Cloud Console setup

1. Go to https://console.cloud.google.com and create a project (e.g. `alveron-labs`).
2. **Enable APIs**: search and enable both
   - `Gmail API`
   - (optional) `Google Cloud Pub/Sub API` for push-based reply detection
3. **OAuth consent screen** (APIs & Services → OAuth consent screen):
   - User type: **External**
   - Add your domain(s) (or use "Testing" mode for development with test users)
   - Scopes: the app requests `openid`, `email`, `gmail.send`, `gmail.modify`
     — none are sensitive; Gmail API scopes must be added as **restricted** scopes
     in the consent screen configuration
   - Add your mailbox as a **test user** while in Testing mode
4. **OAuth client** (APIs & Services → Credentials → Create Credentials → OAuth client ID):
   - Application type: **Web application**
   - Authorized redirect URI (exact):
     ```
     http://127.0.0.1:3100/api/email-accounts/oauth/callback/gmail
     ```
     For a deployed instance, use
     `https://<your-host>/api/email-accounts/oauth/callback/gmail` and set
     `GMAIL_REDIRECT_URI` to match exactly.
5. Copy the **Client ID** and **Client secret**.

### Environment variables

```bash
GMAIL_CLIENT_ID=xxxx.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=xxxx
GMAIL_REDIRECT_URI=http://127.0.0.1:3100/api/email-accounts/oauth/callback/gmail
ENCRYPTION_KEY=<32 random bytes, base64>   # required; tokens are encrypted at rest
```

Generate the encryption key: `python3 -c "import base64,secrets; print(base64.b64encode(secrets.token_bytes(32)).decode())"`

### Security properties (implemented)

- OAuth `state` is generated server-side, stored with a 10-minute expiry, and
  verified with a constant-time comparison on callback
- `redirect_uri` on callback must exactly match the configured value
- Access + refresh tokens are encrypted with AES-256-GCM before touching
  PostgreSQL; the API never returns them
- Access tokens auto-refresh; a failed refresh marks the account
  `disconnected` and stops sends
- Gmail revocation endpoint is called on disconnect

## 2. Microsoft 365 (priority 2)

### Azure setup

1. https://portal.azure.com → App registrations → New registration
2. Redirect URI: Web → `http://127.0.0.1:3100/api/email-accounts/oauth/callback/microsoft`
3. API permissions: `Mail.Send`, `Mail.Read`, `User.Read`, `offline_access`
   (delegated)
4. Certificates & secrets → New client secret

### Environment variables

```bash
MICROSOFT_CLIENT_ID=xxxx
MICROSOFT_CLIENT_SECRET=xxxx
MICROSOFT_REDIRECT_URI=http://127.0.0.1:3100/api/email-accounts/oauth/callback/microsoft
```

Known Graph limitation (documented, not hidden): `sendMail` does not return a
message id. The API records `sent` with a null provider message id and relies
on thread/recipient matching for reply detection.

## 3. Resend (transactional/system)

```bash
RESEND_API_KEY=re_xxxx
RESEND_WEBHOOK_SECRET=xxxx        # optional: delivery/bounce webhooks
```

Reply detection is not natively supported by Resend — use Gmail/Graph for
outreach reply detection; Resend is for system email.

## After configuration

1. Restart the API
2. Dashboard → Email Accounts → Connect Gmail → Google consent screen →
   callback → account shows `connected`
3. Mark it as the default outreach account
4. Approve an outreach → n8n picks it up → the API sends via the connected
   mailbox → provider confirms → status `sent` with the provider message id
5. Reply detection polls the mailbox and cancels follow-up sequences on a
   genuine reply; bounces and out-of-office are recorded as events
