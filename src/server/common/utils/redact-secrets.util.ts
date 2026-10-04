/**
 * A configuration object with every secret-looking value blanked.
 *
 * Matches by key name, recursively. Errs towards blanking: a URI or key that
 * was harmless reads "[redacted]" too, which costs an operator a look into the
 * environment, while a missed secret would cost the platform.
 */
const SECRET_KEY =
  /secret|password|passwd|pass$|token|apikey|api_key|privatekey|private_key|credential|salt|uri$|url$|dsn|key$/i;
const REDACTED = '[redacted]';

export function redactSecrets<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => redactSecrets(entry)) as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] =
        SECRET_KEY.test(key) && entry !== null && typeof entry !== 'object' && typeof entry !== 'boolean'
          ? REDACTED
          : redactSecrets(entry);
    }
    return out as T;
  }
  return value;
}
