import { Database } from "bun:sqlite"
import { join } from "node:path"
import { xdgData } from "xdg-basedir"
import type { Resets } from "./windows"

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
    rolling? : { resetsAt?: string }
    weekly?  : { resetsAt?: string }
    monthly? : { resetsAt?: string }
  }
}

let cached: { at: number; resets: Resets } | undefined

function parse(value: unknown): number | undefined {
  const at = Date.parse(String(value))
  return Number.isNaN(at) ? undefined : at
}

// cached 10 min, so the window can be up to 10 min stale
export async function resets(
  db: Database
): Promise<Resets> {

  if (cached && Date.now() - cached.at < RESET_TTL) return cached.resets

  const next = await fetchResets(db)
  cached = { at: Date.now(), resets: next }
  return next
}

async function fetchResets(
  db: Database
): Promise<Resets> {

  const key = apiKey(db)
  if (!key) return cached?.resets ?? {}

  try {
    const response = await fetch(USAGE_URL, { headers: { Authorization: `Bearer ${key}` } })
    if (!response.ok) return cached?.resets ?? {}

    const { usage } = await response.json() as UsageResponse

    return {
      rolling : parse(usage?.rolling?.resetsAt),
      weekly  : parse(usage?.weekly?.resetsAt),
      monthly : parse(usage?.monthly?.resetsAt),
    }
  } catch {
    return cached?.resets ?? {}
  }
}
