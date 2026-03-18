/**
 * Timeout and limited-retry utilities for scan and connection flows.
 * No infinite retries; fail cleanly with useful errors.
 */

/**
 * Rejects with a clear error if the promise does not settle within ms.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (e) {
    clearTimeout(timeoutId!);
    throw e;
  }
}

export type RetryOptions = {
  maxAttempts: number;
  timeoutMs?: number;
  label: string;
};

/**
 * Runs fn up to maxAttempts times. No infinite retries.
 * If timeoutMs is set, each attempt is wrapped in withTimeout.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const { maxAttempts, timeoutMs, label } = options;
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const promise = fn();
      const wrapped = timeoutMs
        ? withTimeout(promise, timeoutMs, `${label} (attempt ${attempt})`)
        : promise;
      return await wrapped;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt === maxAttempts) break;
    }
  }
  throw lastError ?? new Error(`${label} failed after ${maxAttempts} attempts`);
}
