# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **Context-menu submenus (分类 / 标签 / 复制 / 队列) showed as a thin empty box
  with a scrollbar instead of their entries.** The popup was rendered inside
  `.ctxmenu__list`, which scrolls (`overflow-y: auto`) whenever the menu is
  taller than 75vh — and an absolutely positioned child of a scrolling box is
  clipped by it. Measured: the submenu (176px wide) intersected the list's clip
  box for only **8 visible pixels**.

  The obvious fix, `position: fixed`, did NOT work and the reason is worth
  recording: `.ctxmenu` carries `backdrop-filter` (from `glass-panel`), and an
  element with a backdrop-filter becomes the **containing block for its
  fixed-position descendants**. So `fixed` resolved against the menu rather than
  the viewport and the popup stayed clipped — diagnosed in-page as
  `fixed resolves against an ancestor: ctxmenu glass-panel
  (backdrop-filter=blur(22px) saturate(1.6))`.

  The submenu is now **teleported to `<body>`**, which removes both the clipping
  ancestor and the containing block. The outside-click handler also accepts the
  teleported popup, so pressing a submenu entry no longer closes the menu before
  the entry's own handler runs.

  Two further faults in that first attempt are recorded because each produced a
  visible bug of its own:

  - **A submenu opened at the top of the screen instead of beside the hovered
    item.** Treating a not-yet-measured height (`offsetHeight` reads 0 before
    layout) as "the popup is as tall as the viewport" made the clamp compute
    `vh - vh - margin`, pinning _every_ popup to the top edge. With an unknown
    height the popup is now placed at its row and clamped not at all; the
    post-paint pass lifts it only if it genuinely overflows.
  - **A submenu near the bottom of the menu hung off-screen.** `ref="submenuEl"`
    sits inside `v-for="item in items"`, and Vue assigns a template ref declared
    inside a `v-for` an **array** rather than an element. Reading it as a scalar
    made `offsetHeight` `undefined`, so the clamp silently did nothing — measured
    at `top: 827` for a 112px popup in a 900px viewport, 39px off-screen. The ref
    is now normalised to a single element.

  A popup taller than the space below it scrolls inside itself rather than
  running off the screen.
- **The Queue submenu reported the wrong action, and silently did nothing for
  torrents the server had not queued.** Two separate faults:

  - All four items toasted _"Move to top"_ regardless of which was chosen,
    because the label was hard-coded to `action.queueTop`.
  - qBittorrent's own handlers each begin with
    `if (const int position = torrent->queuePosition(); position >= 0)`, so a
    stopped, finished or force-started torrent (position `-1`) is skipped — the
    request returns 200 while changing nothing, and the UI reported success.

  The correct label is now used per action, and torrents that cannot be reordered
  are filtered out. When none of the selection can be moved, the app says so
  instead of claiming success. Force-started torrents are excluded from the
  request but no longer block the queued ones in the same selection.
- **qBittorrent 5.x "stopped" torrents were not recognised anywhere.** 5.0
  renamed the state: `pausedDL`/`pausedUP` became `stoppedDL`/`stoppedUP`, and
  `torrentStateToString()` in `serialize_torrent.cpp` has no `paused*` case at
  all on 5.x. Only the old spelling was matched, so on a 5.x server the filter
  chip labelled "stopped" listed nothing and read 0, stopped torrents were
  tallied in no category while still counting towards the total, they appeared
  under "running", the status badge printed the raw token `stoppedDL`, and the
  detail page offered "Stop" for a torrent that was already stopped. Both
  spellings are now handled through a single `isStopped()` helper, `forcedMetaDL`
  is recognised, and the missing `stopped*` translations were added.
  - The reason a fully green suite missed this: every fixture used the 4.x names
    (`stoppedDL` appeared in no test), so the tests encoded the same wrong
    assumption as the code. Both generations are now pinned by tests.
- **The in-app login form rejected a valid login on some builds.** `auth.ts`
  required the response body to be exactly `"Ok."`, but qBittorrent answers a
  successful login with `204` and an empty body on some builds — the cookie is
  issued and the user is told "invalid username or password". A `200 + "Ok"`
  reply also surfaced the literal string `Ok` as the error message. Success is
  now determined the way `static-public/index.html` already did it (a 2xx means
  success unless the body explicitly says `Fails.`). This is a regression of a
  bug AGENT.md §2 documents having fixed once: the fix went into the static entry
  page, and `login-view.spec.ts` mocks `@/api/auth` wholesale, so the module had
  no test of its own. It has one now, covering every documented response shape.
- **Editing a byte-unit setting silently changed its value.** The display scales
  bytes into KiB/MiB and rounds to 2 decimals, while the setter scaled the typed
  number back by the *displayed* unit. Clearing the field and retyping what you
  saw turned `1500 B/s` into `1495`, `1025` into `1024`, and `1500000` into
  `1499463`. The write-back factor is now derived from the stored value rather
  than the rounded text, and re-committing the displayed number preserves it
  exactly. Verified over a range of values including the KiB/MiB boundaries.
- **Changing a file's priority could paint the previous torrent's file list.**
  `setFilePriority` refetched the file list after an `await` with no identity
  check — a second write path into `files` that bypassed the `loadToken` guard
  `loadTab` uses. Switching torrents while the refetch was in flight showed the
  wrong torrent's files. It now carries the same token and hash check.
- **A stale `transfer/info` response could repopulate a session that had been
  torn down**, and an older response could overwrite a newer one, because the
  handler never re-checked identity after its `await`.
- **RSS: clicking Download on one article made every same-id article spin.**
  The spinner was keyed on `article.id` while ids are only unique within a feed
  (the `v-for` key correctly used `feedPath:id`). Two feeds sharing an article id
  spun both buttons; it is keyed on the full identity now.
- **RSS: folders nested inside folders were never rendered.** The tree template
  hard-coded exactly two levels and filtered children to `kind === 'feed'`, so a
  subfolder and everything under it vanished from the DOM — unreachable and
  unclickable, while the parent still advertised unread counts for it. Rendering
  is now recursive (`RssTreeNode.vue`), matching the parser's arbitrary depth.
- **The tablet table hid the status column and truncated every name.** Compact
  mode dropped both `ratio` and `state`, leaving no way to tell a downloading
  torrent from a stopped or errored one without opening it, while still spending
  width on size/progress/speeds/ETA and squeezing names to about nine characters.
  Compact now keeps the status badge, drops only `ratio`, and gives the name
  column a larger share.
- **The torrent context menu ignored the multi-selection: right-clicking one of
  several ticked torrents acted on that torrent alone.** The computed targets
  (`menuTargets` in `DashboardView.vue`) consulted the right-clicked hash before
  the selection, and because opening the menu always sets that hash, the branch
  returning the whole selection was unreachable dead code. Ticking five torrents,
  right-clicking one and choosing Remove deleted one torrent, not five. The
  selection is now the source of truth and the hash is only a fallback for a
  torrent that vanished while the menu was open. `Remove` / `Remove and delete
  files` also stopped capping themselves at the right-clicked row, so the "N
  torrents" wording in their confirmation dialog now matches what is deleted.
- **The selection toolbar hid nearly every action on a phone.** Its action row
  was `nowrap` with `overflow-x: auto` and no visible scrollbar, so a narrow
  screen showed the first two buttons and gave no hint that seven more existed —
  it read as a toolbar with only two options. The row now wraps: start / stop /
  force start occupy the first line and the rest wraps below, with the
  destructive pair last. Measured on the built app at 360 px and 430 px:
  `scrollWidth === clientWidth` and zero clipped controls.
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

- **Escape clears the torrent selection.** With one or many torrents ticked —
  mouse or touch — pressing Escape deselects them, matching the file-manager
  behaviour the rest of the list already follows.

  Precedence is deliberate: the shortcut only fires when nothing else owns the
  key. An open context menu consumes the first Escape to close itself (and the
  selection survives), a confirmation dialog keeps Escape for dismissing, and a
  focused text field keeps it for reverting what was typed. A dead key that
  silently wiped a selection the user was acting on would be worse than no
  shortcut at all.
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

- **Theme colours are now chosen per role rather than per hue.** Several tokens
  were used as small text while being tuned as fills, and `--text-tertiary` was
  the Apple *dark-mode* grey (`#8e8e93`) in **both** themes. Measured from real
  painted pixels, the light theme's green status badge came to **1.8:1** and its
  accent badge to 3.4:1 against a 4.5 threshold, and the tertiary grey measured
  2.99:1 on the light canvas. Text now uses dedicated `--*-text` tokens plus
  `--accent-fill` / `--danger-fill` for white-on-fill buttons, while fills, dots
  and progress bars keep the vivid macOS colours. The greys are calibrated
  against the surfaces that actually occur — including the translucent glass and
  tinted chips, which are darker than the plain canvas, so choosing a value
  against the canvas alone is not sufficient. `--state-*` now has a dark-theme
  override too; it previously existed only on `:root`. All eight audited views in
  both themes measure 0 WCAG AA failures, down from 22-25 (light) and 4-10 (dark).
- **The stop action is now called "停止" / "Stop" rather than "暂停" / "Pause".**
  qBittorrent 5.x has a single stop action — `torrents/stop`, renamed from
  `torrents/pause` in 5.0 with no alias — so the previous wording described
  something the server cannot distinguish, and a separate "stop" beside it would
  have been a second button posting the identical request. The toolbar now reads
  开始 / 停止 / 强制开始, the trio the stock WebUI offers. Only the visible text
  changed: the i18n key stays `action.pause` and the API function stays
  `pauseTorrents`, because those are internal names the tests reference. State and
  filter labels follow the same wording ("已停止" / "Stopped"), so a torrent does
  not report itself as paused right after being stopped.
- The unauthenticated entry page is a sign-in form rather than a redirect; see
  Fixed above for why a redirect cannot work.
- Declared `engines` and `packageManager` in `package.json`, and added
  `.nvmrc`. A preflight script now fails fast with an actionable message when
  Node is too old or npm/yarn is used instead of pnpm.
- Removed the bundled CI workflow, as the hosting Gitea instance has no Actions
  runner. The documented local check is the source of truth.
- **One command now publishes every mirror: `pnpm release`.** The repository is
  mirrored (self-hosted Gitea plus GitHub) and the `dist` branch is the download
  package for people with no build toolchain, so a mirror left behind serves a
  stale package — and that failure is silent until someone reports a bug that was
  already fixed. `pnpm release` runs the checks, builds, validates the artifacts,
  pushes the source branch, rebuilds and publishes `dist`, then confirms every
  remote matches. `pnpm publish:dist` now pushes to **all** configured remotes
  instead of `origin` only, treating each independently so one being unreachable
  does not leave the others unpublished.

  The `dist` README also quoted a stale file count and told ZIP downloaders to
  avoid the very folder they should use; both are corrected.

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