/**
 * Provider keys are read here and only here, server-side, from the environment (.env.local, gitignored).
 * Nothing in this file is ever sent to the browser. A missing key means the provider is off, not an error.
 */
export type AlpacaKeys = { keyId: string; secret: string };

export function alpacaKeys(env: NodeJS.ProcessEnv = process.env): AlpacaKeys | null {
  const keyId = env.ALPACA_KEY_ID?.trim();
  const secret = env.ALPACA_SECRET_KEY?.trim();
  if (!keyId || !secret) return null;
  return { keyId, secret };
}
