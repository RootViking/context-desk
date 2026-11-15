import { isWatchSymbol } from "@/domain/watchlist";
import { loadChain } from "@/server/chain-client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const symbol = params.get("symbol")?.toUpperCase() ?? "";
  if (!isWatchSymbol(symbol)) return Response.json({ error: "Unknown symbol." }, { status: 400, headers: { "cache-control": "no-store" } });
  const result = await loadChain(fetch, symbol, { bypassCache: params.get("refresh") === "1" });
  return Response.json(result, { headers: { "cache-control": "no-store" } });
}
