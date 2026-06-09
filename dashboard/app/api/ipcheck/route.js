// READ-ONLY view of Shelter's live registered-IP whitelist (getallips). Answers "is this IP
// registered?" without ever writing. The full 14k IP set stays server-side (never sent to the
// browser) — the client only receives a boolean + the total count. No fabricated data.
import fs from "node:fs";
import path from "node:path";
export const dynamic = "force-dynamic";

// IP_REGISTRY_ALLIPS_URL lives in the parent Shelter/.env (the connector's env). Read only that one key.
function allipsUrl() {
  try {
    const env = fs.readFileSync(path.join(process.cwd(), "..", ".env"), "utf8");
    const m = env.match(/^\s*IP_REGISTRY_ALLIPS_URL\s*=\s*(.*)\s*$/m);
    return m ? m[1].trim() : "";
  } catch {
    return "";
  }
}

let setCache = { at: 0, set: null };
async function registeredSet() {
  if (setCache.set && Date.now() - setCache.at < 60000) return setCache.set; // 60s cache (same as connector)
  const url = allipsUrl();
  if (!url) return null;
  const r = await fetch(url);
  if (!r.ok) throw new Error("getallips HTTP " + r.status);
  const arr = await r.json();
  setCache = { at: Date.now(), set: new Set(arr.map((x) => String(x).trim())) };
  return setCache.set;
}

let ipCache = { at: 0, ip: "" };
async function systemIp() {
  if (ipCache.ip && Date.now() - ipCache.at < 300000) return ipCache.ip;
  try {
    const ip = (await (await fetch("https://api.ipify.org?format=json")).json()).ip;
    ipCache = { at: Date.now(), ip };
    return ip;
  } catch {
    return "";
  }
}

const isV4 = (s) => { const p = String(s || "").trim().split("."); return p.length === 4 && p.every((o) => /^\d{1,3}$/.test(o) && +o <= 255); };

export async function GET(req) {
  let set;
  try {
    set = await registeredSet();
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 502 });
  }
  if (!set) return Response.json({ ok: false, error: "IP_REGISTRY_ALLIPS_URL تنظیم نشده" }, { status: 500 });

  const ip = (new URL(req.url).searchParams.get("ip") || "").trim();
  if (ip) {
    if (!isV4(ip)) return Response.json({ ok: false, error: "آی‌پیِ نامعتبر" }, { status: 400 });
    return Response.json({ ok: true, ip, registered: set.has(ip), total: set.size });
  }
  const sys = await systemIp();
  return Response.json({ ok: true, total: set.size, systemIp: sys || null, systemRegistered: sys ? set.has(sys) : null });
}
