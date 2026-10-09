/** Prevent content strings from terminating an HTML script element. */
export function safeScriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
