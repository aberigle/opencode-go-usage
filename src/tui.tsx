import { Plugin } from "@opencode/plugin/tui"
import { createMemo, createSignal, onCleanup, Setter, Show } from "solid-js"
import type { Snapshot } from "./aggregate"
import { formatCost, formatTokens, line, timeLeft, totalTokens } from "./utils"
import type { WindowKey } from "./windows"
import { WINDOWS } from "./windows"

const WINDOW_KEYS = Object.keys(WINDOWS) as WindowKey[]

// available space in sidebar
const BLOCK_WIDTH = 37
const COST_WIDTH  = 8
const TOKEN_WIDTH = 7

const ERROR_TEXT = "could not read usage, check the logs"

function createWorker(
  setData  : Setter<Snapshot | null>,
  setError : Setter<string | undefined>
) {

  const fail = (error: string) => {
    console.error(`go-usage: ${error}`)
    setError(error)
  }

  const worker = new Worker(new URL("./worker.js", import.meta.url).href)

  // a burst of events costs one snapshot, and the last one still lands
  let running = false
  let again   = false

  const run = () => {
    running = true
    worker.postMessage({ now: Date.now() })
  }

  worker.onmessage = (event: MessageEvent) => {
    if (event.data?.ok) setData(event.data.snapshot)
    else fail(String(event.data?.error))

    if (!again) return running = false

    again = false
    return run()
  }

  worker.onerror = (event: ErrorEvent) => {
    fail(event.message)
    running = false
    again   = false
  }

  return {
    request   : () => !running ? run() : again = true,
    terminate : () => worker.terminate()
  }
}

function listenForEvents(
  context  : Plugin.Context,
  listener : () => void
) {
  const abort = new AbortController()

  const iterate = async () => {
    const events = context.client.event.subscribe({ signal: abort.signal })
    for await (const event of events)
      if (
        event.type === "session.usage.updated"
      ) listener()
  }

  void iterate().catch(() => { })

  return {
    terminate : () => abort.abort()
  }
}

function GoUsage(
  props: { context: Plugin.Context }
) {
  const theme = props.context.theme

  const [data, setData] = createSignal<Snapshot | null>(null)
  const [error, setError] = createSignal<string | undefined>()
  const [view, updateView] = props.context.storage.store("view", { initial: { open: true } })

  const worker   = createWorker(setData, setError)
  const listener = listenForEvents(props.context, worker.request)

  onCleanup(() => {
    listener.terminate()
    worker.terminate()
  })

  worker.request()


  // One line per model, the window totals and the countdown. Recomputed only when the
  // worker answers with a new snapshot, so nothing repaints on a timer.
  const blocks = createMemo(() => {
    const snapshot = data()

    return WINDOW_KEYS.map((key) => {
      const models = snapshot?.byWindow[key] ?? []
      const sum = (pick: (row: (typeof models)[number]) => number) =>
        models.reduce((total, row) => total + pick(row), 0)

      const end = snapshot?.ends[key]
      const left = Number.isFinite(end) ? timeLeft(end! - Date.now()) : "?"
      const percent = snapshot?.percent[key]

      const [label, when] = line([
        { text: key, max: key.length + 1 },
        { text: typeof percent === "number" ? `${Math.round(percent)}% · ${left}` : `· ${left}` },
      ], BLOCK_WIDTH - TOKEN_WIDTH - COST_WIDTH)

      return {
        key,
        left,
        label,
        when,
        rows: models.map((row) => line([
          { text: row.model },
          { text: formatTokens(totalTokens(row)), align: "right", max: TOKEN_WIDTH },
          { text: formatCost(row.cost), align: "right", max: COST_WIDTH },
        ], BLOCK_WIDTH).join("")),
        tail: line([
          { text: formatTokens(sum((row) => totalTokens(row))), align: "right", max: TOKEN_WIDTH },
          { text: formatCost(sum((row) => row.cost)), align: "right", max: COST_WIDTH },
        ], BLOCK_WIDTH).join(""),
      }
    })
  })

  const month = () => blocks().find((block) => block.key === "monthly")!

  return (
    <Show
      when={blocks().some((block) => block.rows.length > 0)}
      // before the first answer, and on failure, the block stands on its own
      fallback={
        <Show when={data() === null || error()}>
          <box flexDirection="column">
            <text fg={theme.text.base}><b>Go usage</b></text>
            <box marginTop={1} />
            <Show when={error()} fallback={<text fg={theme.text.muted}>loading...</text>}>
              <text fg={theme.text.feedback.error.base}>{ERROR_TEXT}</text>
            </Show>
          </box>
        </Show>
      }
    >
      <box>
        <box
          flexDirection="row"
          onMouseDown={() => void updateView((draft) => draft.open = !draft.open)}
        >
          {(() => {
            const block = month()
            const [title, when] = line([
              { text: `${view.open ? "▼ Go usage" : "▶ Go usage"}` },
              { text: block.when, align: "right" },
            ], BLOCK_WIDTH - TOKEN_WIDTH - COST_WIDTH)
            return (
              <>
                <text fg={theme.text.base}>
                  <b>{title}</b>
                </text>
                <Show when={!view.open}>
                  <text fg={theme.text.muted}>{`${when}${block.tail}`}</text>
                </Show>
              </>
            )
          })()}
        </box>

        <Show when={view.open}>
          {blocks().map((block) => (
            <box flexDirection="column" marginTop={1}>
              <box flexDirection="row">
                <text>{block.label}</text>
                <text fg={theme.text.muted}>{block.when}</text>
                <text>{block.tail}</text>
              </box>
              {block.rows.length === 0 ? (
                <text fg={theme.text.muted}>{line([{ text: "(no data)" }], BLOCK_WIDTH)[0]}</text>
              ) : (
                block.rows.map((row) => (
                  <text fg={theme.text.muted}>{row}</text>
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
