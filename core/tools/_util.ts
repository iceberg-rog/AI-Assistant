/** deterministic helpers so the same input always yields the same stub result */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff;
}
export const nowIso = (): string => new Date().toISOString();
export const minutesAgoIso = (m: number): string => new Date(Date.now() - m * 60000).toISOString();
export const pick = <T>(arr: T[], seed: number): T => arr[Math.floor(seed * arr.length) % arr.length];
