/**
 * One write at a time per key in this isolate (D-058), like the editor's save queue: a write
 * reads the latest `_rev` only after the previous write to the same page has finished.
 */
const tails = new Map<string, Promise<unknown>>();

export function queued<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  const next = previous.then(work, work);
  const settled = next.then(
    () => undefined,
    () => undefined,
  );
  tails.set(key, settled);
  void settled.then(() => {
    if (tails.get(key) === settled) tails.delete(key);
  });
  return next;
}
