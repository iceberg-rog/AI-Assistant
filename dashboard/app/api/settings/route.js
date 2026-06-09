// Proxies the connector's settings endpoint (:4050/settings). The connector owns .env and only
// allows a whitelist of NON-SECRET keys to be changed; secrets are never editable from here.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const r = await fetch("http://localhost:4050/settings", { cache: "no-store", signal: AbortSignal.timeout(8000) });
    return Response.json(await r.json());
  } catch {
    return Response.json({ ok: false, error: "کانکتور در دسترس نیست" }, { status: 502 });
  }
}

export async function POST(req) {
  let b;
  try { b = await req.json(); } catch { return Response.json({ ok: false, error: "bad json" }, { status: 400 }); }
  try {
    const r = await fetch("http://localhost:4050/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(b),
      signal: AbortSignal.timeout(8000),
    });
    return Response.json(await r.json());
  } catch {
    return Response.json({ ok: false, error: "کانکتور در دسترس نیست" }, { status: 502 });
  }
}
