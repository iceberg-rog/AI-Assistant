// The bot's knowledge base (golden answers). GET returns all; POST saves an operator edit to one
// intent's answer. Changes apply to the live bot on the next connector restart (it reloads the KB).
import fs from "node:fs";
import path from "node:path";
export const dynamic = "force-dynamic";

const FILE = () => path.join(process.cwd(), "data", "golden_answers.json");
const read = () => { try { return JSON.parse(fs.readFileSync(FILE(), "utf8")); } catch { return { answers: [] }; } };

export async function GET() {
  const j = read();
  return Response.json({ answers: j.answers || [] });
}

export async function POST(req) {
  let b;
  try { b = await req.json(); } catch { return Response.json({ ok: false, error: "bad json" }, { status: 400 }); }
  if (!b.intent) return Response.json({ ok: false, error: "intent required" }, { status: 400 });
  const j = read();
  const a = (j.answers || []).find((x) => x.intent === b.intent);
  if (!a) return Response.json({ ok: false, error: "not found" }, { status: 404 });
  // only edit safe content fields
  if (typeof b.final_answer_fa === "string") a.final_answer_fa = b.final_answer_fa;
  if (typeof b.summary === "string") a.summary = b.summary;
  if (Array.isArray(b.do_not_say)) a.do_not_say = b.do_not_say.map((s) => String(s)).filter(Boolean);
  if (Array.isArray(b.clarifying_questions)) a.clarifying_questions = b.clarifying_questions.map((s) => String(s)).filter(Boolean);
  a.editedAt = new Date().toISOString();
  try { fs.writeFileSync(FILE(), JSON.stringify(j, null, 2), "utf8"); }
  catch (e) { return Response.json({ ok: false, error: e.message }, { status: 500 }); }
  return Response.json({ ok: true, answer: a });
}
