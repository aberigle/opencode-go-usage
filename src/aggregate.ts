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
}

const QUERY = `
select json_extract(data,'$.model.id')                            as model,
       count(*)                                                    as requests,
       coalesce(sum(json_extract(data,'$.cost')), 0)               as cost,
       coalesce(sum(json_extract(data,'$.tokens.input')), 0)       as input,
       coalesce(sum(json_extract(data,'$.tokens.cache.read')), 0)  as cacheRead,
       coalesce(sum(json_extract(data,'$.tokens.cache.write')), 0) as cacheWrite,
       coalesce(sum(json_extract(data,'$.tokens.output')), 0)      as output,
       coalesce(sum(json_extract(data,'$.tokens.reasoning')), 0)   as reasoning
from session_message
where json_extract(data,'$.model.providerID') = ?
  and time_created >= ? and time_created <= ?
group by model
order by cost desc
`

export function snapshot(
  db      : Database,
  now     : number = Date.now(),
  resets? : Resets
): Snapshot {

  const wins = windows(now, resets)
  const byWindow = {} as Record<WindowKey, Row[]>
  const stmt = db.prepare(QUERY)
  for (const { key, from, to } of wins) byWindow[key] = stmt.all(PROVIDER, from, to) as Row[]
  return { byWindow }
}
