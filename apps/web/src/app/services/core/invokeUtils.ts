/**
 * Safe parsing of Tauri invoke() results.
 * Backend may return a JSON string or an already-parsed object; this handles both.
 */
export function parseInvokeResult<T>(result: unknown): T {
  if (typeof result === 'string') return JSON.parse(result) as T;
  return result as T;
}
