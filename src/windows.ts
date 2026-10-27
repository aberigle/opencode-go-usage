export const WINDOWS = {
  rolling : 5  * 3600_000,
  weekly  : 7  * 86400_000,
  monthly : 30 * 86400_000,
} as const

export type WindowKey = keyof typeof WINDOWS

interface Window {
  key  : WindowKey
  from : number
  to   : number
}

export interface Resets {
  rolling? : number
  weekly?  : number
  monthly? : number
}

// account-wide consumption of each limit, as the API reports it
export type Percent = Partial<Record<WindowKey, number>>

// both come from the same response, so they travel together
export interface Limits {
  resets  : Resets
  percent : Percent
}

function previousReset(
  reset: number
): number {
  const d   = new Date(reset)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() - 1)
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, lastDay))
  return d.getTime()
}

function startOfMonth(
  now: number
): number {
  const d = new Date(now)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
}

export function windows(
  now     : number,
  resets? : Resets
): Window[] {
  const windows = Object.keys(WINDOWS) as WindowKey[]

  return windows
    .map((key) => {
      const span  = WINDOWS[key]
      const reset = resets?.[key]
      const month = key === "monthly"

      if (typeof reset !== "number") return {
        key,
        from: month ? startOfMonth(now) : now - span,
        to: now
      }

      // the cached reset already passed, the current window opened there
      if (reset <= now) return { key, from: reset, to: now }

      return { key, from: month ? previousReset(reset) : reset - span, to: reset }
    })
}
