import { getDatabase, readState, saveState } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export function GET() {
  try { return Response.json({ state: readState(getDatabase()) }, { headers }); }
  catch { return Response.json({ error: "Could not load SQLite data." }, { status: 500, headers }); }
}

export async function PUT(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      // Next.js may normalize request.url to localhost; Host retains the browser's address.
      const source = new URL(origin);
      const host = request.headers.get("host") ?? new URL(request.url).host;
      if (!["http:", "https:"].includes(source.protocol) || source.host !== host) throw new Error("Invalid origin");
    } catch {
      return Response.json({ error: "Invalid request origin." }, { status: 403, headers });
    }
  }
  const body = await request.text();
  if (Buffer.byteLength(body) > 5_000_000) return Response.json({ error: "Backup is too large (maximum 5 MB)." }, { status: 413, headers });
  let value: unknown;
  try { value = JSON.parse(body); }
  catch { return Response.json({ error: "Invalid JSON." }, { status: 400, headers }); }
  try {
    return Response.json({ state: saveState(getDatabase(), value) }, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save SQLite data." }, { status: 400, headers });
  }
}
