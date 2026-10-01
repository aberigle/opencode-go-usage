// The JSX has to be compiled with the Solid preset from @opentui/solid (the same one the
// host uses to transform plugins). Bun's own transpiler compiles JSX "eager": `when={...}`
// is evaluated once and the children are a static array, so a component that paints data
// arriving later never repaints.
import solid from "@opentui/solid/bun-plugin"

const built = await Bun.build({
  entrypoints : ["src/tui.tsx", "src/worker.ts"],
  outdir      : "dist",
  target      : "bun",
  external    : ["@opencode/plugin", "@opencode/plugin/*", "@opentui/solid", "@opentui/solid/*", "solid-js", "solid-js/*", "xdg-basedir"],
  plugins     : [solid],
})

for (const log of built.logs) console.log(log)
if (!built.success) process.exit(1)
