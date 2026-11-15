import { isTimeframe } from "@/domain/bars";
import { isBarSymbol } from "@/domain/watchlist";
import { loadBars } from "@/server/bars-client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const symbol = params.get("symbol")?.toUpperCase() ?? "";
  const tf = params.get("tf") ?? "15m";
  if (!isBarSymbol(symbol)) return Response.json({ error: "Unknown symbol." }, { status: 400, headers: { "cache-control": "no-store" } });
  if (!isTimeframe(tf)) return Response.json({ error: "Unknown timeframe." }, { status: 400, headers: { "cache-control": "no-store" } });
  const result = await loadBars(fetch, symbol, tf, { bypassCache: params.get("refresh") === "1" });
  return Response.json(result, { headers: { "cache-control": "no-store" } });
}
