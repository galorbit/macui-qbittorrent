/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

interface ImportMetaEnv {
  readonly VITE_QBT_TARGET?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Injected by Vite's `define` from package.json. */
declare const __APP_VERSION__: string