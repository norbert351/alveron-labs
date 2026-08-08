import type { EmailProvider, EmailProviderKind } from './types.ts';
import { GmailProvider } from './GmailProvider.ts';
import { MicrosoftGraphProvider } from './MicrosoftGraphProvider.ts';
import { ResendProvider } from './ResendProvider.ts';

const providers: Record<EmailProviderKind, EmailProvider> = {
  gmail: new GmailProvider(),
  microsoft: new MicrosoftGraphProvider(),
  resend: new ResendProvider(),
};

export function getProvider(kind: EmailProviderKind): EmailProvider {
  const p = providers[kind];
  if (!p) throw new Error(`Unknown email provider: ${kind}`);
  return p;
}

export function providerConfigStatus(kind: EmailProviderKind): { configured: boolean; missing: string[] } {
  const p = providers[kind];
  return { configured: p.isConfigured(), missing: p.missingConfig() };
}

export { providers };
