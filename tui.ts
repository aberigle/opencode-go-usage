// OpenCode looks for the TUI entrypoint as <package>/tui, so the package root needs a
// tui.*. This shim points at the compiled bundle.
export { default } from "./dist/tui.js"
