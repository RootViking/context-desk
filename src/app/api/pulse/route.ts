import { PULSE_SYMBOLS } from "@/domain/pulse";
import { loadQuote } from "@/server/quote-client";

export const dynamic = "force-dynamic";

/** Quotes for the main symbols in one request. Each carries its own provider and stamp. */
export async function GET() {
  const loads = await Promise.all(PULSE_SYMBOLS.map((symbol) => loadQuote(fetch, symbol)));
  return Response.json({ retrievedAt: new Date().toISOString(), loads }, { headers: { "cache-control": "no-store" } });
}
