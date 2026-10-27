import { snapshot } from "./aggregate"
import type { Snapshot } from "./aggregate"
import { limits, open } from "./opencode"

let db: ReturnType<typeof open> | undefined

self.onmessage = async (event: MessageEvent) => {
  try {
    db ??= open()
    const now = typeof event.data?.now === "number" ? event.data.now : Date.now()
    self.postMessage({ ok: true, snapshot: snapshot(db, now, await limits(db)) satisfies Snapshot })
  } catch (error) {
    self.postMessage({ ok: false, error: String(error) })
  }
}
