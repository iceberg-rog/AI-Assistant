// Proxies a bot-token change to the connector (:4050/settoken). The connector validates the token
// against Telegram (getMe) BEFORE saving, so a bad token can't break the running bot. The token is
// never stored or echoed by the dashboard — it only passes through to the connector once.
export const dynamic = "force-dynamic";

export async function POST(req) {
  let b;
  try { b = await req.json(); } catch { return Response.json({ ok: false, error: "bad json" }, { status: 400 }); }
  if (!b?.token) return Response.json({ ok: false, error: "توکن لازم است" }, { status: 400 });
  try {
    const r = await fetch("http://localhost:4050/settoken", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: b.token }),
      signal: AbortSignal.timeout(15000),
    });
    return Response.json(await r.json(), { status: r.status });
  } catch {
    return Response.json({ ok: false, error: "کانکتور در دسترس نیست" }, { status: 502 });
  }
}
