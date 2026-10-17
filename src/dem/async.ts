/** Stop this consumer promptly without aborting a Promise shared by other consumers. */
export function waitForConsumer<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return pending;
  if (signal.aborted) return Promise.reject(new DOMException('Cancelled', 'AbortError'));
  return new Promise<T>((resolve, reject) => {
    const abort = () => { cleanup(); reject(new DOMException('Cancelled', 'AbortError')); };
    const cleanup = () => signal.removeEventListener('abort', abort);
    signal.addEventListener('abort', abort, { once: true });
    pending.then((value) => { cleanup(); resolve(value); }, (error) => { cleanup(); reject(error); });
  });
}
