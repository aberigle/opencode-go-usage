// El JSX tiene que compilarse con el preset de Solid de @opentui/solid (el mismo que
// usa el host para transformar los plugins). El transpilador de Bun compila el JSX
// "eager": `when={...}` se evalua una vez y los hijos son un array estatico, asi que
// un componente que pinta datos que llegan despues no se vuelve a pintar nunca.
import solid from "@opentui/solid/bun-plugin"

const built = await Bun.build({
  entrypoints : ["src/tui.tsx", "src/worker.ts"],
  outdir      : "dist",
  target      : "bun",
  external    : ["@opencode/plugin", "@opencode/plugin/*", "@opentui/solid", "@opentui/solid/*", "solid-js", "solid-js/*"],
  plugins     : [solid],
})

for (const log of built.logs) console.log(log)
if (!built.success) process.exit(1)
