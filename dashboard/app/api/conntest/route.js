// Proxies the connector's live health-check (:4050/healthcheck). The connector owns all the
// integrations + secrets and runs the actual tests; this route just relays the pass/fail results.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const r = await fetch("http://localhost:4050/healthcheck", { cache: "no-store", signal: AbortSignal.timeout(20000) });
    if (!r.ok) return Response.json({ ok: false, error: "connector HTTP " + r.status }, { status: 502 });
    const d = await r.json();
    return Response.json({ ok: true, ...d });
  } catch {
    return Response.json({ ok: false, error: "کانکتور در دسترس نیست (آفلاین؟)" }, { status: 502 });
  }
}
