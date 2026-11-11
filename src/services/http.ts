export const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * fetch ที่ยกเลิกเองเมื่อรอนานเกินกำหนด
 * เขียนเองแทน AbortSignal.timeout/any เพราะ iOS รุ่นที่แอปรองรับยังไม่มีให้ใช้
 */
export async function fetchWithTimeout(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...rest } = init;
  const controller = new AbortController();
  const cancel = () => controller.abort();

  if (signal?.aborted) cancel();
  signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, timeoutMs);

  try {
    return await fetch(`${API_BASE}${path}`, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
