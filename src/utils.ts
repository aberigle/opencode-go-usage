import type { Row } from "./aggregate"

// pretty print a number up to trillions
function compact(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}T`
  if (n >= 1e9)  return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6)  return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3)  return `${(n / 1e3).toFixed(1)}k`
  return String(n)
}

export function formatCost(n: number): string {
  return n < 1e3 ? `$${n.toFixed(2)}` : `$${compact(n)}`
}

export function formatTokens(n: number): string {
  return compact(n)
}

// time left pretty print
export function timeLeft(ms: number): string {
  if (ms <= 0) return "0m"

  const mins = Math.floor(ms / 60_000)
  if (mins < 60) return `${mins}m`

  const hours = Math.floor(ms / 3_600_000)
  if (hours < 24) {
    const rest = mins % 60
    return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`
  }

  const days = Math.floor(ms / 86_400_000)
  const rest = hours % 24
  return rest > 0 ? `${days}d ${rest}h` : `${days}d`
}

// sum tokens incuding cache
export function totalTokens(row: Row): number {
  return row.input + row.cacheRead + row.cacheWrite + row.output + row.reasoning
}

export interface Column {
  text   : string
  align? : "left" | "right"
  max?   : number
}

// pretty print a line with max widths for the columns
export function line(
  columns: Column[],
  width  : number
): string[] {

  const elastic = columns.filter((column) => column.max === undefined)
  const fixed   = columns.reduce((sum, column) => sum + (column.max ?? 0), 0)
  const each    = elastic.length > 0 ? Math.max(1, Math.floor((width - fixed) / elastic.length)) : 0

  return columns
    .map((column) => {
    const size = column.max ?? each
    const text = column.max === undefined && column.text.length > size
      ? `${column.text.slice(0, Math.max(1, size - 1))}…`
      : column.text
    return column.align === "right" ? text.padStart(size) : text.padEnd(size)
  })
}
