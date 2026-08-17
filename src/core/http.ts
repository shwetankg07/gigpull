const MAX_DELAY_MS = 60_000;
const DEFAULT_ATTEMPTS = 4;
const DEFAULT_BASE_DELAY_MS = 1_000;

/**
 * How long to wait before retry `attempt` (zero-indexed).
 *
 * A server's own `Retry-After` wins over the backoff curve — it knows more than
 * we do — but is still capped, so a mistaken or hostile header cannot stall a
 * run for hours.
 */
export function retryDelayMs(
  attempt: number,
  retryAfter: string | null,
  baseDelayMs = DEFAULT_BASE_DELAY_MS,
): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, MAX_DELAY_MS);
    }
  }
  return Math.min(baseDelayMs * 2 ** attempt, MAX_DELAY_MS);
}

/** Retried: rate limits and transient server errors. Client errors are not. */
function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

export interface BackoffOptions {
  attempts?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * fetch with exponential backoff on 429 and 5xx.
 *
 * Returns the final response rather than throwing, so callers keep their
 * existing `res.ok` handling and each collector decides for itself whether a
 * persistent failure is fatal.
 */
export async function fetchWithBackoff(
  url: string,
  init: RequestInit = {},
  opts: BackoffOptions = {},
): Promise<Response> {
  const attempts = opts.attempts ?? DEFAULT_ATTEMPTS;
  const sleep = opts.sleep ?? realSleep;

  let last: Response | undefined;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    last = await fetch(url, init);
    if (!isRetryable(last.status)) return last;

    if (attempt < attempts - 1) {
      await sleep(retryDelayMs(attempt, last.headers.get("retry-after"), opts.baseDelayMs));
    }
  }

  return last!;
}
