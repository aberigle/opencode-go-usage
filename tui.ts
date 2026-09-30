// El loader de OpenCode busca el entrypoint de TUI como <paquete>/tui, asi que en la
// raiz del paquete tiene que haber un tui.*. Este shim apunta al bundle compilado.
export { default } from "./dist/tui.js"
