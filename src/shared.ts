export interface Settings { reduction: number; volume: number; original: boolean }
export const DEFAULTS: Settings = { reduction: 50, volume: 100, original: false };
export type Phase = 'idle' | 'initializing' | 'active' | 'original' | 'error';
export interface Status {
  phase: Phase; tabId?: number; title?: string; error?: string;
  settings: Settings; latencyMs?: number; inferenceMs?: number;
}
export type Command =
  | { type: 'status' }
  | { type: 'start'; tabId: number }
  | { type: 'stop' }
  | { type: 'settings'; settings: Settings };
export type AudioCommand =
  | { type: 'status' } | { type: 'stop' }
  | { type: 'prepare'; tabId: number; title: string; settings: Settings }
  | { type: 'connect'; streamId: string }
  | { type: 'settings'; settings: Settings }
  | { type: 'failure'; error: string };
export interface Reply { ok: boolean; status?: Status; error?: string }
export function isTwitch(url?: string): boolean {
  try { const u = new URL(url!); return u.protocol === 'https:' && (u.hostname === 'twitch.tv' || u.hostname === 'www.twitch.tv'); }
  catch { return false; }
}
export function normalizeSettings(value: Partial<Settings> = {}): Settings {
  value ??= {};
  const number = (n: unknown, fallback: number, max: number) => typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : fallback;
  return { reduction: number(value.reduction, 50, 100), volume: number(value.volume, 100, 150), original: value.original === true };
}
