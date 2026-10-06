# Contributing

Thanks for considering a contribution. This document covers the conventions the
project relies on — most of them exist because the qBittorrent alternative-WebUI
deployment model has sharp edges that are easy to trip over.

## Getting started

```bash
pnpm install
pnpm dev        # http://localhost:5173, proxies /api/v2 to a qBittorrent instance
```

Point the dev server at your instance:

```bash
VITE_QBT_TARGET=http://YOUR_QBITTORRENT_HOST:8080 pnpm dev
```

You will also need **Host header validation disabled** in qBittorrent's WebUI
settings, otherwise requests from `localhost:5173` are rejected — the symptom
looks like a login bug but is not.

## Before opening a pull request

The Gitea instance hosting this project has an Actions runner, so a push to
`main` or a pull request runs the full check — see `.gitea/workflows/ci.yml`.
**CI only verifies.** Releases stay a deliberate local act (`pnpm release`),
because the deployable `dist` branch is built on a development machine.

Please run the same chain locally before pushing: CI is a backstop, not a
substitute for seeing it pass yourself.

```bash
pnpm lint
pnpm typecheck
pnpm build            # includes postbuild validation of the dist/ layout
pnpm verify:dist
pnpm verify:entry
pnpm verify:settings
pnpm test             # after the build, so the dist/-dependent tests run too
```

All of them must pass. The build is not merely a compile step: `scripts/postbuild.mjs`
validates the output against constraints qBittorrent enforces at runtime.

## Hard constraints (do not break these)

Deploying an alternative WebUI imposes rules that are enforced by the server and
produce confusing errors when violated. Each one has a test — keep it passing.

1. **Output layout is `dist/public/` + `dist/private/`.** qBittorrent resolves
   every request under one of those two folders.

2. **Every path must resolve to a regular file.** Directories are rejected with
   `Unacceptable file type, only regular file is allowed.` In particular:
   - **Never include the `private/` or `public/` segment in a URL you
     navigate to.** The server *prepends* it:

     ```
     localPath = root / (session ? "private" : "public") / <request path>
     ```

     So `/index.html` is correct; `/private/index.html` makes the server look
     for `<root>/private/private/index.html` and fail. This is the single
     easiest mistake to make in this codebase — it has already caused a
     release bug once.
   - `manifest.start_url` must name a file (`./index.html`), **never** a
     directory (`./`). A directory there breaks mobile only, because desktop
     tabs never read `start_url`.
   - `public/index.html` must exist, or the first visit from a user without a
     session fails.

3. **`public/index.html` must authenticate, never merely redirect.** With no
   session, *every* request path resolves into `public/`. A redirect from there
   to `/index.html` lands back on the same file, so the visitor sees an endless
   spinner. The page must POST to `api/v2/auth/login` first and only navigate
   once the session cookie exists.

   `pnpm verify:entry` guards this. Run it after any change to
   `static-public/index.html`.

4. **No symlinks anywhere in the output.** The server rejects the whole tree.

5. **No file may reach 10 MiB** (`MAX_ALLOWED_FILESIZE`).

6. **All asset URLs must be relative.** `base: './'` in `vite.config.ts` is
   load-bearing; the mount path is user-configurable and unknown at build time.
   Use **hash routing** for the same reason — qBittorrent does not rewrite
   unknown paths to `index.html`.

7. **`favicon.ico` and `apple-touch-icon.png` must exist in both trees.**
   Browsers request them at the site root regardless of the document path.

## Translations

Locale files live in `src/i18n/locales/`. To add a language:

1. Copy `en.ts` to `<code>.ts` and translate the values (leave keys alone).
2. Register it in `src/i18n/index.ts` (`messages` and `SUPPORTED_LOCALES`).
3. Extend `normaliseLocale()` if the language has variant tags (e.g. `zh`,
   `zh-Hans`, `zh-Hans-CN` should all map to one bundle).

Do **not** add a key to only one locale. A test asserts every locale defines
exactly the same key set, so an omission fails the test run rather than silently
falling back to English.

When adding UI strings, use `t('some.key')` — never a hardcoded literal. If you
find one, translating it is a welcome small PR.

## Code conventions

- Vue 3 `<script setup>` with TypeScript, `strict` mode.
- Prefer the composables in `src/composables/` over ad-hoc component state.
  `useBreakpoint()` is the single source of truth for responsive behaviour.
- Comments should explain **why**, not restate the code. Anything that looks
  arbitrary usually encodes a constraint from qBittorrent's server behaviour —
  say so, ideally with a pointer to the relevant source.
- Do not apply `backdrop-filter` to long scrolling lists. It is a real GPU cost
  on phones; reserve it for chrome (sidebar, toolbar, dialogs).

## Tests

- `src/__tests__/build-layout.spec.ts` — the deployment contract above. These
  inspect the built `dist/`, so run `pnpm build` first.
- `src/__tests__/session-sync.spec.ts` — the `rid` incremental merge. This is
  the most intricate logic in the codebase; changes here need tests.
- `src/__tests__/i18n.spec.ts` — locale detection and translation completeness.
- `src/__tests__/responsive-views.spec.ts` — table vs card presentation.

When fixing a bug, add a test that fails without your fix. Several existing
tests are regression guards for real bugs that shipped during development.

## Reporting bugs

Please include:

- qBittorrent version (`app/version`) and the `lscr.io/linuxserver/qbittorrent`
  image tag.
- Whether it reproduces on desktop, mobile, or both.
- Browser and version.
- For layout problems: whether "Files location" points at the folder
  **containing** `public/` and `private/` (a very common misconfiguration).