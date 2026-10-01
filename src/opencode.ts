import { Database } from "bun:sqlite"
import { xdgData } from "xdg-basedir"
import { join } from "node:path"
import type { Resets } from "./windows"

export const PROVIDER = "opencode-go"

const USAGE_URL = "https://opencode.ai/zen/go/v1/usage"
const RESET_TTL = 10 * 60_000

// same roots opencode uses for its data dir
function dbPath(): string {
  return join(xdgData!, "opencode", "opencode.db")
}

export function open(path = dbPath()): Database {
  return new Database(path, { readonly: true })
}

function apiKey(db: Database): string | undefined {
  const row = db
    .prepare("select value from credential where integration_id = ? and active is not 0 limit 1")
    .get(PROVIDER) as { value?: string } | undefined
  if (!row?.value) return undefined
  try {
    const parsed = JSON.parse(row.value)
    const key = parsed?.key ?? parsed?.apiKey ?? parsed?.token
    return typeof key === "string" && key.length > 0 ? key : undefined
  } catch {
    return undefined
  }
}

type UsageResponse = {
  usage?: {
    rolling?: { resetsAt?: string }
    weekly?: { resetsAt?: string }
    monthly?: { resetsAt?: string }
  }
}

let cached: { at: number; resets: Resets } | undefined

function parse(value: unknown): number | undefined {
  const at = Date.parse(String(value))
  return Number.isNaN(at) ? undefined : at
}

// ponytail: cached 10 min, so the window can be up to 10 min stale. Lower the TTL
// if the 5h window ever needs to be exact.
export async function resets(db: Database): Promise<Resets> {
  if (cached && Date.now() - cached.at < RESET_TTL) return cached.resets

  let key: string | undefined
  try {
    key = apiKey(db)
  } catch {}
  if (!key) return cached?.resets ?? {}

  try {
    const response = await fetch(USAGE_URL, { headers: { Authorization: `Bearer ${key}` } })
    if (!response.ok) return cached?.resets ?? {}
    const { usage } = (await response.json()) as UsageResponse
    const next: Resets = {
      rolling: parse(usage?.rolling?.resetsAt),
      weekly: parse(usage?.weekly?.resetsAt),
      monthly: parse(usage?.monthly?.resetsAt),
    }
    cached = { at: Date.now(), resets: next }
    return next
  } catch {
    return cached?.resets ?? {}
  }
}
