import { snapshot } from "./aggregate"
import type { Snapshot } from "./aggregate"
import { limits, open } from "./opencode"
import { catalog } from "./prices"

let db: ReturnType<typeof open> | undefined

self.onmessage = async (event: MessageEvent) => {
  try {
    db ??= open()
    const now = typeof event.data?.now === "number" ? event.data.now : Date.now()
    const sessionID = typeof event.data?.sessionID === "string" ? event.data.sessionID : undefined
    const [limit, prices] = await Promise.all([limits(db), catalog()])
    self.postMessage({ ok: true, snapshot: snapshot(db, now, limit, prices, sessionID) satisfies Snapshot })
  } catch (error) {
    self.postMessage({ ok: false, error: String(error) })
  }
}
