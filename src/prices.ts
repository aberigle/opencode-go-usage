import type { Tokens } from "./aggregate"

// the catalog publishes the prices and the peak windows. the stored cost is base
// price until this version, from here on it arrives as zero and has to be worked out
const URL = "https://opencode.ai/inference/go/v1/models"
const TTL = 10 * 60_000

type Hours = { gte?: string, lt?: string }

type When = {
  utc_days? : { in: string[] }
  any?      : { all: { utc_hours: Hours }[] }[]
  date?     : { gte?: string, lt?: string }
}

type Rule = {
  when   : When
  factor : number
}

type Cache = {
  read   : number
  write? : number | Record<string, number>
}

export type Prices = {
  input        : { price: number, cache: Cache }
  output       : { price: number }
  multipliers? : Rule[]
}

export type Catalog = Record<string, Prices | undefined>

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]

// cache write can be priced per ttl, opencode bills the shortest one
function write(cache: Cache): number {
  if (cache.write === undefined) return 0
  if (typeof cache.write === "number") return cache.write

  return Math.min(...Object.values(cache.write))
}

// base price of one request, undefined when the model is not in the catalog
export function cost(
  catalog : Catalog,
  model   : string,
  tokens  : Tokens
): number | undefined {

  const prices = catalog[model]
  if (!prices) return undefined

  return (
    tokens.input      * prices.input.price +
    (tokens.output + tokens.reasoning) * prices.output.price +
    tokens.cacheRead  * prices.input.cache.read +
    tokens.cacheWrite * write(prices.input.cache)
  ) / 1e6
}

function minutes(value: string): number {
  const [hour, minute] = value.split(":")
  return Number(hour) * 60 + Number(minute)
}

function within(
  at    : number,
  hours : Hours
): boolean {

  const date = new Date(at)
  const now  = date.getUTCHours() * 60 + date.getUTCMinutes()

  if (hours.gte !== undefined && now < minutes(hours.gte)) return false
  if (hours.lt  !== undefined && now >= minutes(hours.lt)) return false

  return true
}

function holds(
  at   : number,
  when : When
): boolean {

  const date = new Date(at)

  if (when.utc_days && !when.utc_days.in.includes(DAYS[date.getUTCDay()])) return false

  if (when.date) {
    const day = date.toISOString().slice(0, 10)
    if (when.date.gte && day < when.date.gte) return false
    if (when.date.lt  && day >= when.date.lt) return false
  }

  // any branch matches, but every hour rule inside that branch must hold
  if (when.any && !when.any.some((branch) => branch.all.every((rule) => within(at, rule.utc_hours)))) return false

  return true
}

// the gateway doubles the price inside the peak windows, the stored cost never has it
export function factor(
  catalog : Catalog,
  model   : string,
  at      : number
): number {

  const rules = catalog[model]?.multipliers ?? []
  return rules.reduce((total, rule) => holds(at, rule.when) ? total * rule.factor : total, 1)
}

type Response = {
  data: { id: string, cost?: { text?: Prices, multipliers?: Rule[] } }[]
}

let cached: { at: number, catalog: Catalog } | undefined

// no auth, the catalog is public. on any problem the caller falls back to the
// cost opencode stored
export async function catalog(): Promise<Catalog> {
  if (cached && Date.now() - cached.at < TTL) return cached.catalog

  try {
    const response = await fetch(URL)
    if (!response.ok) return cached?.catalog ?? {}

    const body = await response.json() as Response
    const next: Catalog = {}

    for (const model of body.data)
      if (model.cost?.text) next[model.id] = { ...model.cost.text, multipliers: model.cost.multipliers }

    cached = { at: Date.now(), catalog: next }
    return next
  } catch (error) {
    console.error(`go-usage: prices ${String(error)}`)
    return cached?.catalog ?? {}
  }
}
