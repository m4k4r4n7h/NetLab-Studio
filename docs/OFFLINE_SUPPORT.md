# Offline Support

NetLab Studio is designed for classrooms and labs where connectivity may be unreliable. After the production application has been loaded and cached once, it is fully usable without a network connection.

## What works offline

- Creating, editing, saving, opening, and exporting projects.
- Device placement, cabling, and configuration.
- The complete simulation engine: ping, ARP, switching, routing, DNS, TCP, UDP, HTTP, traceroute.
- The terminal and the simulated browser.
- All guided labs, templates, challenges, and validation.
- The Learning Center, Help, About, Preferences, and other dialogs.
- IndexedDB autosave and project restoration on reload.

No core feature calls a remote API, CDN, font service, or external network device, so there is nothing else that needs connectivity.

## Service worker

The production build uses `vite-plugin-pwa` in `generateSW` mode.

Configuration in `vite.config.ts`:

- `registerType: 'autoUpdate'`
- Workbox precache of `**/*.{js,css,html,svg,png,woff2,webmanifest}`
- navigation fallback to `index.html`
- cleanup of outdated caches
- immediate client claim and skip waiting
- a 4 MiB per-file cache limit

The generated service worker and Workbox runtime are emitted to `dist/`. The application shell, CSS, JavaScript, icons, and manifest are precached. The service worker serves the cached shell for navigation requests when offline.

Registration occurs in `src/main.tsx`. The production build is required for offline testing; the Vite development server disables the PWA plugin.

## First-load requirement

The first visit must be online so the browser can download and precache:

- the HTML shell;
- the JavaScript bundle;
- CSS;
- the manifest and icons;
- the service worker and its Workbox runtime.

The browser also requires a secure context. `https://` and `http://localhost` are secure contexts. A plain `http://` origin on a LAN address is not, and service worker registration will be unavailable.

## Cache update behaviour

The app uses automatic updates:

1. A new deployment produces new hashed assets and a new service worker.
2. The service worker installs and caches the new assets.
3. `skipWaiting` and `clientsClaim` activate the new worker promptly.
4. Outdated caches are cleaned up only after the new cache is available.

Existing tabs may continue to run the old JavaScript until reloaded. Reload once after an update notification or after the first visit following a deployment to ensure the new version is active.

The precache never deletes the active working cache before the replacement has installed successfully.

## IndexedDB persistence

The database is named `netlab-studio`.

Object stores:

| Store | Key | Contents |
| --- | --- | --- |
| `projects` | `id` | Full project plus summary metadata |
| `preferences` | `key` | Last opened project, user preferences |

All access goes through `src/storage/db.ts`. If IndexedDB is unavailable (private mode restrictions, browser policy, test environment), the module falls back to in-memory maps. The application remains usable, but data is not preserved across reloads in that fallback mode.

## Autosave

- Every topology/configuration edit marks the project dirty.
- `App.tsx` starts a 900 ms debounce after the last change.
- Autosave is skipped when autosave is disabled in project settings, when the project is not initialized, or when autosave is paused.
- `saveNow()` writes the project, updates the last-project preference, refreshes the project list, and reports save status.
- Manual save is available from the menu and toolbar.

The status bar shows save state and the menu bar shows `Unsaved changes` or `Saved`.

## Restoring a project

On startup:

1. `initializeApp()` reads the `lastProjectId` preference.
2. If present, the full project is loaded from IndexedDB.
3. If not present or missing, a new blank project is created.
4. The project list is loaded for the Open dialog.
5. The simulator is synchronized with the restored project.
6. The application requests persistent storage if the browser supports it.

The boot overlay (`Restoring local workspace…`) is shown until initialization completes.

## Persistent storage

`navigator.storage.persist()` is requested when available. The Preferences dialog shows whether persistence is granted and reports storage usage/quota when `navigator.storage.estimate()` exists.

Persistent storage reduces the chance of eviction, but no browser guarantees permanent storage. Users can clear site data, privacy modes can discard it, and storage pressure can evict origins.

## Export and import backups

Because browser storage is not durable, export projects regularly:

1. **File → Export Project** downloads a versioned JSON file.
2. Store the file outside the browser profile.
3. **File → Import Project** validates the file and loads it.

Exported projects contain devices, interfaces, links, routes, DNS records, services, notes, and settings. See [PROJECT_FORMAT.md](PROJECT_FORMAT.md).

## Removing local data

Deleting a project removes its IndexedDB record. To remove all local data, clear site data for the application origin in the browser settings. This also removes the service worker and cached assets; a subsequent load requires network access to reinstall the application.

## Verifying offline behaviour

1. Run `npm run build`.
2. Run `npm run preview`.
3. Open the preview URL and wait for the application to finish loading.
4. Create or open a project and let autosave complete.
5. In browser DevTools, set the network to **Offline**.
6. Reload the page.
7. Confirm the application shell starts, the saved project is restored, and simulations still run.

If the page fails to load offline:

- confirm you are using the production preview, not the dev server;
- confirm the origin is `localhost` or HTTPS;
- confirm the service worker is activated in DevTools → Application → Service Workers;
- check that the Cache Storage entries exist;
- confirm the browser does not block storage for the origin.

## Limitations

- First load requires network access.
- Service workers require a secure context.
- Private browsing and strict site-data policies may disable or discard storage.
- Offline state is per browser profile and per origin.
- There is no server-side backup or account sync.
- An already-open tab may need one reload to pick up a new deployment.
