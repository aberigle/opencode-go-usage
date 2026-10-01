import type { Database } from "bun:sqlite"
import { PROVIDER } from "./opencode"
import { windows } from "./windows"
import type { Resets, WindowKey } from "./windows"

export interface Row {
  model      : string
  requests   : number
  cost       : number
  input      : number
  cacheRead  : number
  cacheWrite : number
  output     : number
  reasoning  : number
}

export interface Snapshot {
  byWindow : Record<WindowKey, Row[]>
  ends     : Record<WindowKey, number | undefined>
}

const QUERY = `
select coalesce(json_extract(data,'$.model.id'), '?')             as model,
       time_created                                                 as at,
       coalesce(json_extract(data,'$.cost'), 0)                    as cost,
       coalesce(json_extract(data,'$.tokens.input'), 0)            as input,
       coalesce(json_extract(data,'$.tokens.cache.read'), 0)       as cacheRead,
       coalesce(json_extract(data,'$.tokens.cache.write'), 0)      as cacheWrite,
       coalesce(json_extract(data,'$.tokens.output'), 0)           as output,
       coalesce(json_extract(data,'$.tokens.reasoning'), 0)        as reasoning
from session_message
where json_extract(data,'$.model.providerID') = ?
  and time_created >= ? and time_created <= ?
`

interface Sample extends Omit<Row, "requests"> {
  at : number
}

const FIELDS = ["cost", "input", "cacheRead", "cacheWrite", "output", "reasoning"] as const

// the windows are nested, so one scan of the widest range covers all of them
function bucket(
  samples : Sample[],
  from    : number,
  to      : number
): Row[] {

  const totals = new Map<string, Row>()

  for (const { at, ...sample } of samples) {
    if (at < from || at > to) continue

    let total = totals.get(sample.model)
    if (!total) {
      total = { model: sample.model, requests: 0, cost: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0 }
      totals.set(sample.model, total)
    }

    total.requests += 1
    for (const key of FIELDS) total[key] += sample[key]
  }

  return [...totals.values()].sort((a, b) => b.cost - a.cost)
}

export function snapshot(
  db      : Database,
  now     : number = Date.now(),
  resets? : Resets
): Snapshot {

  const wins = windows(now, resets)
  const byWindow = {} as Record<WindowKey, Row[]>
  const ends = {} as Record<WindowKey, number | undefined>

  const from = Math.min(...wins.map((win) => win.from))
  const to   = Math.max(...wins.map((win) => win.to))
  const samples = db.prepare(QUERY).all(PROVIDER, from, to) as Sample[]

  for (const { key, from, to } of wins) {
    byWindow[key] = bucket(samples, from, to)
    ends[key] = resets?.[key]
  }
  return { byWindow, ends }
}
