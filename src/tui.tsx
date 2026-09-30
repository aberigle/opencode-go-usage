/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui"
import { createSignal, onCleanup, Show } from "solid-js"
import { WINDOWS } from "./windows"
import type { WindowKey } from "./windows"
import type { Row } from "./aggregate"

const KEYS = Object.keys(WINDOWS) as WindowKey[]

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

function tokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`
  return String(n)
}

const WIDTH = 38
const PRICE = 8
const NUM = 7
const NAME = WIDTH - PRICE - 1 - NUM

function GoUsage(props: { context: Plugin.Context }) {
  const theme = props.context.theme
  const [data, setData] = createSignal<Record<WindowKey, Row[]> | null>(null)

  const worker = new Worker(new URL("./worker.ts", import.meta.url).href)

  const [view, updateView] = props.context.storage.store("view", { initial: { open: true } })

  const request = () => worker.postMessage({ now: Date.now() })
  worker.onmessage = (event: MessageEvent) => {
    if (event.data?.ok) setData(event.data.snapshot.byWindow)
  }
  worker.onerror = () => { }

  onCleanup(() => worker.terminate())
  request()

  try {
    const events = props.context.client.event.subscribe()
    void (async () => {
      for await (const event of events as AsyncIterable<{ type?: string }>) {
        if (event?.type === "session.usage.updated" || event?.type === "session.usage.recorded") request()
      }
    })().catch(() => { })
  } catch {}

  const totalOf = (row: Row) => row.input + row.cacheRead + row.cacheWrite + row.output + row.reasoning

  const blocks = () =>
    KEYS.map((key) => {
      const all = data()?.[key] ?? []
      return {
        key,
        rows: all.map((row) => ({
          model : (row.model.length > NAME ? row.model.slice(0, NAME - 1) + "…" : row.model).padEnd(NAME),
          total : totalOf(row),
          cost  : row.cost,
        })),
        total: all.reduce((sum, row) => sum + totalOf(row), 0),
        cost: all.reduce((sum, row) => sum + row.cost, 0),
      }
    })

  const month = () => blocks().find((block) => block.key === "month")!

  return (
    <Show when={blocks().some((block) => block.rows.length > 0)}>
      <box>
        <box flexDirection="row" onMouseDown={() => {
          void updateView((draft) => {
            draft.open = !draft.open
          }).catch(() => { })
        }}>
          <text fg={theme.text.base}>
            <b>{`${view.open ? "▼" : "▶"} Go usage`}</b>
          </text>
          <Show when={!view.open}>
            <text fg={theme.text.muted}>
              {`${tokens(month().total).padStart(NUM + NAME - 12)}${money.format(month().cost).padStart(PRICE)}`}
            </text>
          </Show>
        </box>

        <Show when={view.open}>
          {blocks().map((block) => (
            <box flexDirection="column" marginTop={1}>
              <text >{`${block.key.padEnd(NAME)}${tokens(block.total).padStart(NUM)}${money
                .format(block.cost)
                .padStart(PRICE)}`}</text>
              {block.rows.length === 0 ? (
                <text fg={theme.text.muted}>{`${" ".repeat(NAME)}(sin datos)`}</text>
              ) : (
                block.rows.map((row) => (
                  <text fg={theme.text.muted}>
                    {`${row.model}${tokens(row.total).padStart(NUM)}${money.format(row.cost).padStart(PRICE)}`}
                  </text>
                ))
              )}
            </box>
          ))}
        </Show>
      </box>
    </Show>
  )
}

export default Plugin.define({
  id: "go-usage",
  setup(context) {
    return context.ui.slot({
      append: "sidebar.content",
      render: () => <GoUsage context={context} />,
    })
  },
})
