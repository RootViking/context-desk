import { loadWire } from "@/server/wire-client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  return Response.json(await loadWire(fetch, { bypassCache: refresh }), { headers: { "cache-control": "no-store" } });
}
