type DebugData = Record<string, unknown>;

export function debugLog(scope: string, event: string, data?: DebugData): void {
  const at = Math.round(performance.now());
  const prefix = `[HorikoreDebug:${scope}] ${at}ms ${event}`;
  if (data) console.log(prefix, data);
  else console.log(prefix);
}
