import { isBarSymbol } from "@/domain/watchlist";
import { loadQuote } from "@/server/quote-client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const symbol = new URL(request.url).searchParams.get("symbol")?.toUpperCase() ?? "";
  if (!isBarSymbol(symbol)) return Response.json({ error: "Unknown symbol." }, { status: 400, headers: { "cache-control": "no-store" } });
  return Response.json(await loadQuote(fetch, symbol), { headers: { "cache-control": "no-store" } });
}
