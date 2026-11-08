# Contributing

Thanks for improving NetLab Studio. The project is an educational simulator, so correctness, clear explanations, and deterministic behaviour matter more than adding features quickly.

## Development setup

Requirements:

- Node.js 22 LTS or newer
- npm 10 or newer

```bash
npm ci
npm run dev
```

Open `http://localhost:5173`.

Useful commands:

```bash
npm run lint       # TypeScript check
npm test           # Vitest unit and integration suites
npm run test:watch # Watch mode
npm run build      # Type check and production build
npm run test:e2e   # Playwright against a production preview
```

Install Chromium once before running E2E tests:

```bash
npx playwright install chromium
```

## Project conventions

- TypeScript everywhere. Avoid `any` unless a boundary genuinely requires it.
- No comments in source files. Use meaningful names, small functions, and clear module boundaries instead.
- No TODOs, placeholders, empty handlers, or non-functional controls.
- Keep protocol logic in `src/engine`. Components must not compute routing, ARP, DNS, or TCP behaviour.
- Keep project mutations in the Zustand store so undo history, dirty state, and simulator synchronization stay consistent.
- Use structured CSS in `src/styles`; reuse tokens from `tokens.css`.
- Keep all assets local. Do not add CDN, remote font, or external API dependencies.
- Never add real network access, `eval`, `Function`, or unrestricted HTML rendering.

## Architecture boundaries

```text
components ──► store ──► engine
                 │          ▲
                 └──────► storage
```

- Engine modules import types and utilities only.
- Storage modules validate and serialize; they do not decide network behaviour.
- Learning content can call the engine for validation but cannot depend on components.
- UI dialogs dispatch store actions and close themselves; they do not hold authoritative project state.

## Adding a feature

### New device type

1. Extend `DeviceKind` in `src/types`.
2. Add a definition and port templates to `DEVICE_DEFINITIONS` in `src/devices/factory.ts`.
3. Add device-class and cable compatibility rules in `src/devices/connectionRules.ts`.
4. Add engine role handling in `NetworkSimulator.ts` if the device forwards or behaves differently from existing roles.
5. Add an SVG symbol in `src/canvas/DeviceSymbol.tsx`.
6. Update inspector sections if the device has unique configuration.
7. Add it to labs or templates where appropriate.
8. Add tests for behaviour and project validation.

### New protocol

1. Extend the packet/application model in `src/engine/core/packet.ts`.
2. Add event types and labels in `src/engine/core/events.ts`.
3. Add a request variant and implementation in `NetworkSimulator.ts`.
4. Expose it in the packet generator and CLI where useful.
5. Document its scope and limitations in `docs/NETWORK_ENGINE.md` and README.
6. Add an engine unit test that verifies both success and failure paths.

### New guided lab, template, or challenge

1. Add builder functions in `src/labs/builders.ts` if needed.
2. Add content to `guidedLabs.ts`, `templates.ts`, or `challenges.ts`.
3. Use real simulation checks for connectivity, DNS, and HTTP rather than text matching.
4. Ensure the generated project passes `validateProject`.
5. Add or update tests in `tests/unit/labs.test.ts`.

### New project field

1. Add the field to the domain type.
2. Add a safe default and validation in `projectSerializer.ts`.
3. Preserve it in `cloneProject` and import/export.
4. Add an inspector or dialog editor.
5. Extend the project format documentation.
6. Increment the project version only for breaking changes, and add migration handling if required.

## Testing expectations

Before submitting:

```bash
npm run lint
npm test
npm run build
```

Add or update tests for:

- every new engine decision and drop path;
- every new import/validation rule;
- new visible controls that affect user flows;
- learning content that must build valid projects.

Unit tests live in `tests/unit`, React integration tests in `tests/integration`, and Playwright tests in `tests/e2e`. Use the existing builders and helpers in `src/labs/builders.ts` to keep topology setup readable.

When fixing a bug, add a regression test that fails before the fix.

## Code style details

- Prefer pure functions for calculations and serialization.
- Keep event summaries actionable and explanations educational.
- Use `isValidIpv4`, mask helpers, and subnet helpers rather than ad hoc parsing.
- Generate IDs through `createId` and MACs through the factory.
- Sanitize any server-provided HTML through `sanitizeHtml`.
- Cap new loops and recursive walks with explicit safeguards.
- Clean up timers, listeners, and object URLs in components.

## Commit and pull request guidance

- Keep commits focused and describe the behaviour changed.
- Include tests and documentation in the same change where possible.
- Describe the user-visible effect, the tests run, and any limitations.
- Do not commit `node_modules`, `dist`, test reports, traces, local editor settings, or secrets.
- Do not weaken validation or error handling to make a test pass.

## Reporting issues

Include:

- browser and version;
- steps to reproduce;
- expected and actual behaviour;
- a project JSON export when the issue is topology-specific;
- console errors, if any;
- whether the app was online or offline.

Do not include credentials or sensitive personal data in project exports.

## License

By contributing, you agree that your contributions are shared under the Advance Tech Club of NIAT Open License in this repository.
