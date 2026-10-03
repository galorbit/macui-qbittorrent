# macui-qbittorrent — build output

Prebuilt static files for the **macOS-style qBittorrent WebUI**. This branch
contains ONLY build output, so it can be used on a host without Node.js or pnpm.

Source lives on the `main` branch.

Run `pnpm build` on `main` to regenerate this branch's contents.

## Layout

```
public/     unauthenticated entry — the sign-in page
private/    the application itself
version.txt build provenance
```

## Deployment

Point qBittorrent's **Use alternative WebUI** setting at the folder that
CONTAINS `public/` and `private/` — not at `private/` itself, and not at this
repository root.

```yaml
# docker-compose.yml (lscr.io/linuxserver/qbittorrent)
volumes:
  - /path/to/this/repo:/macos-theme:ro
environment:
  - QBT_WEBUI_PORT=40110
```

Then in qBittorrent: **Options → Web UI → Use alternative WebUI**, and set
*Files location* to `/macos-theme`.

Restart the container, then hard-refresh the browser (Ctrl+F5) to clear the old
service worker.

### Why the parent folder

qBittorrent resolves a request as:

```
<root>/private/<request path>     when a session exists
<root>/public/<request path>      otherwise
```

It wants `<root>` — the directory holding both subfolders. Pointing it at
`private/` makes it look for `private/private/index.html`, which fails with
"Unacceptable file type, only regular file is allowed."

### Constraints this output already satisfies

The alternative-WebUI loader is strict. `scripts/postbuild.mjs` on `main`
enforces each of these, and the build fails rather than shipping a broken tree:

- **No symlinks** — rejected outright by the server.
- **Every file under 10 MiB** (`MAX_ALLOWED_FILESIZE`).
- **`public/` must exist and be non-empty** — otherwise the login page cannot be
  served and there is no way in.
- **Relative asset paths only** — the WebUI may be mounted under any prefix.
- **Favicons present in both trees** — a missing `/favicon.ico` returns 500.
- **`manifest.start_url` must not be a directory** — a directory target triggers
  "Unacceptable file type".

Current output: 46 files, ~519 KiB, largest file 150 KiB.

## Updating

On the machine that has Node.js:

```bash
git checkout main && git pull
pnpm install && pnpm build
# publish the new output to this branch
```

On the deployment host, where only the files are needed:

```bash
git pull
docker restart qbittorrent
```

Then hard-refresh the browser.

## Note on the service worker

The app registers a service worker, so browsers may keep serving a cached
version after an update. A hard refresh (Ctrl+F5, or Cmd+Shift+R) forces the new
build. On mobile, clearing site data is the reliable route.

## License

MIT — see the `main` branch.