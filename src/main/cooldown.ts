// "At most once every `interval` ms per key" (e.g. per contact).
export type Cooldown = {
  // 0 and starts a new interval if allowed; otherwise the ms left until it is.
  take(key: string, now?: number): number
}

export function cooldown(interval: number): Cooldown {
  const last = new Map<string, number>()
  return {
    take(key, now = Date.now()) {
      const left = (last.get(key) ?? -Infinity) + interval - now
      if (left > 0) return left
      last.set(key, now)
      return 0
    }
  }
}

// Anti-spam limits, per contact.
export const WINK_INTERVAL = 30_000 // full-screen winks, sent and received
export const BUZZ_INTERVAL = 10_000 // buzzes, sent and received
export const NOTIFY_INTERVAL = 10_000 // desktop notifications for messages
export const ARRIVAL_INTERVAL = 60_000 // "X se ha conectado" (notification + sound)
