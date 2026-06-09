/** Loads the real Phase-1 KB (taxonomy, golden answers, DNS registry) from the dashboard data dir. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dir, "..", "dashboard", "data");

function load(name: string): any {
  return JSON.parse(fs.readFileSync(path.join(DATA, name), "utf8"));
}

const taxonomy = load("intents_taxonomy.json");
const golden = load("golden_answers.json");
const dnsRegistry = load("dns_registry.json");

export interface TaxIntent {
  id: string;
  fa_label: string;
  automation_tier: string;
  triggers?: string[];
  required_tools?: string[];
  escalate_when?: string;
}

export const intents: TaxIntent[] = taxonomy.intents || [];
export const goldenAnswers: any[] = golden.answers || [];
export const dnsPools: any[] = dnsRegistry.dns_pools || [];

export const intentById = new Map<string, TaxIntent>(intents.map((i) => [i.id, i]));
export const goldenById = new Map<string, any>(goldenAnswers.map((g) => [g.intent, g]));

export const DATA_DIR = DATA;
