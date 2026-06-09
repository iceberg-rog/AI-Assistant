/** Escalation queue — in-memory for the stub; replace with a real queue/table. */
import type { EscalationItem } from "../logs/schemas.ts";

const queue: EscalationItem[] = [];

export function createEscalation(item: EscalationItem): EscalationItem {
  queue.push(item);
  return item;
}
export function getEscalations(): EscalationItem[] {
  return queue.slice();
}
export function clearEscalations(): void {
  queue.length = 0;
}
