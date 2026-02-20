# AGENTS.md — Guidelines for Agentic Tools

## Project overview

**deepstate** is a proxy-based reactive state management library built on RxJS.
Bun monorepo with two packages:

- `packages/core` — `@montra-interactive/deepstate`: core state engine (Proxy + BehaviorSubject per leaf, combineLatest for objects, BehaviorSubject<T[]> for arrays)
- `packages/react` — `@montra-interactive/deepstate-react`: React bindings (`useSelect`, `usePipeSelect`, `useObservable`)

Runtime: **Bun only**. Never use Node.js, npm, yarn, pnpm, jest, vitest, webpack, vite, express, or dotenv. See `CLAUDE.md` for the full Bun-first policy.

---

## Build / lint / test

### Install

```sh
bun install
```

### Build

```sh
bun run build                      # all packages
bun run build --filter core        # core only
bun run build --filter react       # react only
```

### Test

```sh
bun test                           # entire monorepo
bun run test:core                  # core package only
bun run test:react                 # react package only
bun test --watch                   # watch mode
bun test --coverage                # with coverage
```

### Test — single file

```sh
bun test packages/core/tests/state-basic.test.ts
```

### Test — single test by name

```sh
bun test --test-name-pattern "should get initial primitive values"
```

### Test — single file + name

```sh
bun test packages/core/tests/state-basic.test.ts --test-name-pattern "should set primitive"
```

### Type-check

```sh
bunx tsc --noEmit
```

### Linting / formatting

No linter or formatter is configured (no ESLint, Prettier, or Biome). Follow the code style conventions below manually.

---

## Code style

### Imports

1. Third-party imports first (`rxjs`, `react`), then relative/local imports.
2. Use named imports; never use `import *`.
3. Use `import type` for type-only imports (required by `verbatimModuleSyntax`).
4. Separate rxjs root (`rxjs`) from `rxjs/operators` imports.

### Formatting

- **Indentation**: 2 spaces.
- **Semicolons**: always.
- **Quotes**: single quotes in `.ts` source, double quotes in JSX attributes.
- **Trailing commas**: yes, in multi-line constructs.
- **Line length**: soft limit ~120 chars; no enforced maximum.

### Naming

| Kind                     | Convention    | Example                             |
| ------------------------ | ------------- | ----------------------------------- |
| Variables, functions     | `camelCase`   | `createLeafNode`, `subscribeCount`  |
| Types, interfaces        | `PascalCase`  | `NodeCore`, `RxNullable`, `Draft`   |
| Constants (symbols)      | `UPPER_SNAKE` | `NODE`, `NULLABLE_MARKER`           |
| Generics                 | `T`, `U`, `R` | `TNonNull`                          |
| Observable variables     | `$` suffix    | `subject$`, `lock$`, `combined$`    |
| Source files             | `camelCase`   | `deepstate.ts`, `hooks.ts`          |
| Test files               | `kebab-case`  | `state-basic.test.ts`               |

### TypeScript strictness

The tsconfig enables `strict: true`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, and `verbatimModuleSyntax`.

- Prefer precise types over `any`/`unknown`; narrow early.
- Type assertions (`as`) are acceptable when the type system cannot prove safety (e.g., proxy internals), but minimize their use.
- Use `[T] extends [X]` to prevent union distribution in conditional types.
- Explicit return type annotations are not required — rely on inference — but document complex return types.
- Use `type` for unions/intersections/mapped types; use `interface` when extending or implementing.

### Error handling

- **Fail fast** with descriptive `Error` messages (see `findCircularReference` for the pattern).
- Use `try/finally` to ensure cleanup (locks, subscriptions) even on error.
- Test error cases with `expect(() => ...).toThrow(/pattern/)`.
- No-op (silent ignore) is acceptable only for operations on null parents — document why.
- Never swallow errors silently in new code.

### Observables / RxJS

- Every leaf property owns a `BehaviorSubject` as source of truth.
- Objects derive their observable via `combineLatest(children)`.
- Arrays use `BehaviorSubject<T[]>` as source, with child projections.
- Always suffix observable variables with `$`.
- Use `distinctUntilChanged` to prevent redundant emissions.
- Use `shareReplay(1)` for derived observables that may have multiple subscribers.

### Testing patterns

- Import from `bun:test`: `import { describe, test, expect } from "bun:test";`
- Import library code from the package `src/`, not `dist/`.
- Track emissions with an array: `const emissions: T[] = []; store.x.subscribe(v => emissions.push(v));`
- For batching verification, reset emission count after initial subscribe:
  ```ts
  let emissions = 0;
  store.user.subscribe(() => emissions++);
  emissions = 0;
  store.user.update(draft => { /* ... */ });
  expect(emissions).toBe(1);
  ```
- React component tests use `@testing-library/react` with `render`, `screen`, `act`.
- Wrap state updates in React tests with `await act(...)`.

---

## Repository specifics

- **Monorepo**: Bun workspaces (`"workspaces": ["packages/*"]`).
- **No CI configured yet**. Ensure commands are non-interactive and deterministic.
- **No .cursor rules or GitHub Copilot instructions** exist. If added, mirror directives here.
- **Secrets**: never commit tokens or `.env` files.
- **PRs**: small, focused; include tests and a rationale; link issues.
- **Internal markers**: use `Symbol()` for internal node identification (`NODE`, `NULLABLE_NODE`, etc.) — never expose symbols in the public API.
- **jsdom preload**: React tests require `packages/react/tests/setup.ts` (configured in `bunfig.toml`).
- **Test timeout**: 5000ms (configured in root `bunfig.toml`).
