import { base44 } from '@/api/base44Client';

// Tracking is explicitly best-effort and must never interrupt checkout.
export function trackShirtEvent(eventName) {
  try {
    Promise.resolve(base44.analytics.track({ eventName })).catch(() => {});
  } catch {
    // A synchronous analytics failure is also non-critical.
  }
}