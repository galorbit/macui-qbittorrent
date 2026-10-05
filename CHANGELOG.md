# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **The unauthenticated entry page looped forever ("Redirecting to the WebUI…"
  with a permanent spinner).** It was implemented as a redirect, which cannot
  work: qBittorrent resolves `localPath = root / (session ? "private" :
  "public") / <request path>`, so with no session *every* path lands in
  `public/`. A redirect to `/index.html` therefore resolved straight back to the
  same file. The page is now a real sign-in form — authenticate first, then
  navigate — which is also what the stock WebUI does. Verified by an automated
  harness that boots the built page in jsdom and drives all four flows
  (`pnpm verify:entry`, 18 checks).
- **The hand-off page redirected to `/private/index.html`, causing "Unacceptable
  file type, only regular file is allowed."** The server *prepends* the
  `private/` segment itself, so requesting it made the server look for
  `<root>/private/private/index.html`. This was a regression introduced while
  fixing the earlier relative-redirect concern, and the test meant to guard it
  asserted the broken URL — both are corrected.
- Removed a stray `pnpm-workspace.yaml` that made pnpm treat the project as a
  workspace root, breaking `pnpm install` with "packages field missing or
  empty" on a fresh clone.
- **Mobile browsers showed "Unacceptable file type, only regular file is
  allowed."** The PWA manifest declared `start_url: "./"`, which — because the
  manifest is served from `/private/manifest.webmanifest` — resolves to the
  *directory* `/private/`. qBittorrent refuses any request that is not a
  regular file. Desktop tabs never consult `start_url`, which is why only
  mobile was affected. Now `./index.html`.
- **Root `/favicon.ico` requests could 500.** Browsers request it at the site
  root regardless of the document path. `favicon.ico` and
  `apple-touch-icon.png` are now emitted into both `private/` and `public/`.

### Added

- **Right-click menu on the torrent list, mirroring the stock WebUI's
  `torrentsTableMenu`.** Right-click a row on desktop, long-press a card on
  mobile. Menu items are data (`src/composables/useTorrentContextMenu.ts`), so the
  visibility rules can be unit-tested without mounting anything, and the chrome is
  our own (`MacContextMenu.vue`) — frosted panel, mac corner radii, submenus and
  tri-state ticks, not the stock DOM.
  - Lifecycle start / stop / force start are mutually pruned by the stock menu's
    own three-branch rule — stop disappears when everything is already stopped,
    force start when everything is already force-started, and start when the whole
    selection is already running and there is nothing for it to do. The last
    branch was missing here, so the menu offered a Start that could only ever be a
    no-op.
  - The download limit disappears once the whole selection is complete, as in the
    stock menu, taking its separator down to the upload limit with it.
  - Category and tag submenus, per-torrent rate limits, share-ratio limit,
    automatic torrent management, queue priority, set location, rename (and
    rename files when metadata exists), recheck, reannounce, export, copy
    (name / hash / magnet / path) and both delete variants.
  - Sequential download and first-last-piece-prio are replaced by Super seeding
    once the selection is complete, because the first two only apply while
    downloading.
  - **Every item has a real effect.** There is no placeholder branch: each id maps
    to an API call, a clipboard write, a file download or a real dialog, asserted
    per item by `src/__tests__/context-menu-actions.spec.ts`.
- **Full preferences editor: 162 settings across 8 groups** (Behaviour,
  Downloads, Connection, Speed, BitTorrent, RSS, WebUI, Advanced), replacing the
  previous 28-field subset. Driven declaratively by
  `src/config/settings-schema.ts`, so adding a preference is a one-line change.
  - Search across all groups, since 162 fields is too many to scan.
  - Only changed keys are submitted, so saving never clobbers a preference this
    UI does not model.
  - 36 fields whose misconfiguration can break a running instance are marked
    `dangerous` and hidden behind a "Show advanced options" toggle.
  - Fields with a dependency (`temp_path` needing `temp_path_enabled`, and so
    on) disable themselves automatically.
  - Units are shown and converted in one place: KiB/s, MiB, minutes, seconds.
  - The standalone sign-in page now has its own inline EN/ZH strings, so the
    login screen is translated before the app bundle ever loads.
- **Automatic language detection** from the browser's language list, with an
  explicit switcher in the sidebar and mobile drawer. The choice persists in
  `localStorage`; clearing it returns to browser detection.
- `<html lang>` is kept in sync so CJK font fallbacks apply from first paint.
- Locale files are now split per language (`src/i18n/locales/`); settings
  labels live in `locales/settings.ts` because there are ~200 of them. Tests
  assert every locale defines the same keys and that every schema field has a
  translation.
- `pnpm verify:entry` — an automated harness that boots the built sign-in page
  in jsdom and checks all four flows (no session, wrong credentials, banned IP,
  valid session), including that navigation happens *after* authentication.

### Changed

- The unauthenticated entry page is a sign-in form rather than a redirect; see
  Fixed above for why a redirect cannot work.
- Declared `engines` and `packageManager` in `package.json`, and added
  `.nvmrc`. A preflight script now fails fast with an actionable message when
  Node is too old or npm/yarn is used instead of pnpm.
- Removed the bundled CI workflow, as the hosting Gitea instance has no Actions
  runner. The documented local check is the source of truth.

### Removed

- `.gitea/workflows/ci.yml` (no runner available on the target instance).

## [0.1.0] - 2025-01-01

### Added

- Initial release: a macOS-styled alternative WebUI for qBittorrent 5.x.
- Responsive layout: desktop table, tablet compact table, mobile card list
  with drawer navigation and bottom tab bar.
- macOS design system: system font stack, layered corner radii, frosted-glass
  chrome with an opaque fallback, and light/dark/system themes.
- Live updates over qBittorrent's `rid`-based incremental sync protocol.
- Torrent management: add (file/magnet/URL), pause, resume, recheck,
  reannounce, categorise, delete (with or without files), file priorities.
- Torrent detail view: overview, files, peers, trackers.
- Settings view covering a safe subset of qBittorrent preferences.
- Build output reshaped to qBittorrent's required `public/` + `private/`
  layout, with validation of symlinks, file size and relative asset paths.

<!--
  Keep-a-Changelog style comparison links belong here once the repository has a
  public URL, e.g.

  [Unreleased]: https://github.com/OWNER/REPO/compare/v0.1.0...HEAD
  [0.1.0]: https://github.com/OWNER/REPO/releases/tag/v0.1.0

  They are deliberately omitted rather than pointing at a private mirror.
-->