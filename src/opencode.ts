import { Database } from "bun:sqlite"
import { join } from "node:path"
import { xdgData } from "xdg-basedir"
import type { Limits, Percent, Resets } from "./windows"

export const PROVIDER = "opencode-go"

// credential rows, newest first: the console oauth login, then the older API key
const CREDENTIALS = ["opencode", PROVIDER] as const

const USAGE_URL = "https://opencode.ai/zen/go/v1/usage"
const RESET_TTL = 10 * 60_000

// same roots opencode uses for its data dir
function dbPath(): string {
  return join(xdgData!, "opencode", "opencode.db")
}

export function open(path = dbPath()): Database {
  return new Database(path, { readonly: true })
}

// undefined on any problem, the db read included.
function apiKey(db: Database): string | undefined {
  for (const provider of CREDENTIALS) {
    try {
      const row = db
        .prepare("select value from credential where integration_id = ? and active is not 0 order by time_updated desc limit 1")
        .get(provider) as { value?: string } | undefined

      if (!row?.value) continue

      const parsed = JSON.parse(row.value)
      const key = parsed?.access ?? parsed?.key ?? parsed?.apiKey ?? parsed?.token
      if (typeof key === "string" && key.length > 0) return key
    } catch {
      // fall through to the next provider
    }
  }

  return undefined
}

type UsageResponse = {
  usage?: {
    rolling? : { resetsAt?: string; percent?: number }
    weekly?  : { resetsAt?: string; percent?: number }
    monthly? : { resetsAt?: string; percent?: number }
  }
}

const KEYS = ["rolling", "weekly", "monthly"] as const

let cached: { at: number; limits: Limits } | undefined

function parse(value: unknown): number | undefined {
  const at = Date.parse(String(value))
  return Number.isNaN(at) ? undefined : at
}

// one response carries both the reset dates and the consumed percent
function toLimits(usage: UsageResponse["usage"]): Limits {
  const resets: Resets = {}
  const percent: Percent = {}

  for (const key of KEYS) {
    const window = usage?.[key]
    if (window === undefined) continue

    const reset = parse(window.resetsAt)
    if (reset !== undefined) resets[key] = reset
    if (typeof window.percent === "number") percent[key] = window.percent
  }

  return { resets, percent }
}

// cached 10 min, so the window can be up to 10 min stale
export async function limits(
  db: Database
): Promise<Limits> {

  if (cached && Date.now() - cached.at < RESET_TTL) return cached.limits

  const next = await fetchLimits(db)
  cached = { at: Date.now(), limits: next }
  return next
}

async function fetchLimits(
  db: Database
): Promise<Limits> {

  const empty: Limits = { resets: {}, percent: {} }
  const key = apiKey(db)
  if (!key) return cached?.limits ?? empty

  try {
    const response = await fetch(USAGE_URL, { headers: { Authorization: `Bearer ${key}` } })
    if (!response.ok) return cached?.limits ?? empty

    const { usage } = await response.json() as UsageResponse
    return toLimits(usage)
  } catch {
    return cached?.limits ?? empty
  }
}
