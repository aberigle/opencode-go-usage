export const WINDOWS = {
  "5h"  : 5 * 3600_000,
  week  : 7 * 86400_000,
  month : 30 * 86400_000,
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

const RESET_KEY: Record<WindowKey, keyof Resets> = {
  "5h": "rolling",
  week: "weekly",
  month: "monthly",
}

export function windows(
  now: number,
  resets?: Resets
): Window[] {

  return (Object.keys(WINDOWS) as WindowKey[]).map((key) => {
    const span = WINDOWS[key]
    const reset = resets?.[RESET_KEY[key]]
    const to = typeof reset === "number" ? reset : now
    const from = key === "month" && typeof reset === "number" ? previousReset(to) : to - span
    return { key, from, to }
  })
}
