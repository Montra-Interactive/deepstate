# Deepstate vs Other State Management Libraries

A thorough technical comparison of deepstate against valtio, redux, and deep-state-observer.

## Executive Summary

| Feature | deepstate | valtio | redux | deep-state-observer |
|---------|-----------|--------|-------|---------------------|
| **Architecture** | Nested BehaviorSubjects | Proxy + subscription registry | Single store + reducers | Central Map with path matching |
| **Change complexity** | O(depth) | O(subscribers to changed subtree) | O(selectors) | O(listeners) |
| **Sibling isolation** | Native (architectural) | Partial (subtree scoped) | Manual (selectors) | Manual (path patterns) |
| **RxJS integration** | Native (IS Observable) | None (wrapper needed) | None (middleware) | None |
| **TypeScript DX** | Excellent (full inference) | Good | Good (with RTK) | Limited |
| **Batching** | Built-in `update()` | Automatic | Built-in (dispatch) | Manual |
| **Learning curve** | Low | Low | High | Medium |
| **Bundle size** | ~3KB + RxJS | ~3KB | ~2KB (+ RTK ~12KB) | ~5KB |

## Architecture Deep Dive

### Deepstate V2

```
Architecture: Nested BehaviorSubjects with combineLatest propagation

┌─────────────────────────────────────────────────────────────────┐
│                         Root Observable                          │
│              combineLatest([user$, settings$, items$])          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│    user$      │  │  settings$    │  │   items$      │
│ combineLatest │  │ combineLatest │  │ BehaviorSubj  │
│([name$,age$]) │  │([theme$])     │  │   (array)     │
└───────┬───────┘  └───────┬───────┘  └───────────────┘
        │                  │
   ┌────┴────┐        ┌────┘
   ▼         ▼        ▼
┌──────┐  ┌──────┐  ┌──────┐
│name$ │  │age$  │  │theme$│   ← Leaf BehaviorSubjects
│ BS   │  │ BS   │  │ BS   │     (source of truth)
└──────┘  └──────┘  └──────┘
```

**Key insight**: When `name$` emits, only `name$` → `user$` → `root$` are notified. `age$`, `theme$`, `settings$` never see the event.

```typescript
// What happens when you change user.name:
store.user.name.set("Bob");

// 1. name$ BehaviorSubject emits "Bob"
// 2. user$ combineLatest receives it, emits { name: "Bob", age: 30 }
// 3. root$ combineLatest receives it, emits full state
// 4. settings$ and its children: NOTHING HAPPENS (not in the chain)
```

### Valtio

```
Architecture: Proxy + subscription registry per proxy object

┌─────────────────────────────────────────────────────────────────┐
│                      Root Proxy Object                          │
│           listeners: Set<() => void>  (notified on ANY change) │
└──────────────────────────┬──────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│  user (Proxy) │  │settings(Proxy)│  │ items (Proxy) │
│   listeners   │  │   listeners   │  │   listeners   │
└───────────────┘  └───────────────┘  └───────────────┘
```

**Key insight**: Valtio notifies ALL listeners on a proxy when ANY property changes. You can subscribe to nested proxies for more granular updates, but parent listeners still fire.

```javascript
// What happens when you change user.name:
state.user.name = "Bob";

// 1. user proxy traps the set
// 2. ALL listeners on user proxy are notified
// 3. ALL listeners on root proxy are notified
// 4. settings proxy listeners: NOT notified (different subtree)
```

**Valtio's strength**: You CAN subscribe to `state.user` and not get notifications for `state.settings`. But if you subscribe to `state`, you get ALL changes.

**Valtio's weakness**: No way to subscribe to just `user.name` without also getting `user.age` changes (both notify the `user` proxy).

### Redux

```
Architecture: Single store + action dispatch + selectors

┌─────────────────────────────────────────────────────────────────┐
│                        Single Store                              │
│                  store.subscribe() → ALL dispatches              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                    ┌──────┴──────┐
                    ▼             ▼
              ┌──────────┐  ┌──────────┐
              │ Selector │  │ Selector │  ← Must manually memoize
              │ user.name│  │user.age  │    to avoid re-renders
              └──────────┘  └──────────┘
```

**Key insight**: Redux notifies ALL store subscribers on EVERY dispatch. Selectors + memoization are required for performance.

```javascript
// What happens when you dispatch:
dispatch(setUserName("Bob"));

// 1. Reducer runs, produces new state
// 2. ALL store.subscribe() listeners are called
// 3. Each connected component runs its selector
// 4. Memoization prevents re-render if selected value unchanged
```

**Redux's weakness**: Even with selectors, every dispatch triggers every selector to run (at minimum a reference check).

### Deep-State-Observer

```
Architecture: Central listeners Map with string path matching

┌─────────────────────────────────────────────────────────────────┐
│                     State Object (plain)                        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     Listeners Map                               │
│  "user.name"     → [callback1, callback2]                       │
│  "user.age"      → [callback3]                                  │
│  "settings.*"    → [callback4]  (wildcard)                      │
│  "items.:index"  → [callback5]  (parameterized)                 │
└─────────────────────────────────────────────────────────────────┘
```

**Key insight**: On every update, iterates ALL listeners and does path matching.

```javascript
// What happens when you update user.name:
state.update("user.name", "Bob");

// 1. For EACH listener in the Map:
//    - Check if listener path matches "user.name"
//    - If match, call the callback
// 2. O(listeners) path matching operations per update
```

**Deep-state-observer's weakness**: Linear scan through all listeners on every update.

## Performance Comparison

### Scenario: 100 subscribers, change 1 leaf property

| Library | Work performed |
|---------|----------------|
| **deepstate v2** | 1 BehaviorSubject emit + ~3 combineLatest updates (depth) |
| **deepstate v1** | 100 map operations + 100 deepEqual comparisons |
| **valtio** | Notify listeners on changed proxy + ancestors (variable) |
| **redux** | 100 selector executions (reference checks) |
| **deep-state-observer** | 100 path match operations |

### Complexity Analysis

| Operation | deepstate v2 | valtio | redux | deep-state-observer |
|-----------|-------------|--------|-------|---------------------|
| Single property change | O(depth) | O(subtree subscribers) | O(selectors) | O(listeners) |
| Batch N changes | O(depth) with `update()` | O(subtree × N) auto-batched | O(selectors) | O(listeners × N) |
| Add subscriber | O(1) | O(1) | O(1) | O(1) |
| Memory per subscriber | 1 subscription | 1 callback | 1 selector | 1 entry + path |

## Feature Comparison

### 1. RxJS Integration

**Deepstate**: Native Observable - IS an Observable, not wraps one.

```typescript
// Deepstate - native RxJS
import { combineLatest, debounceTime } from 'rxjs';

const store = state({ user: { name: "Alice" }, count: 0 });

// Direct pipe operations
store.user.name.pipe(
  debounceTime(300),
  distinctUntilChanged()
).subscribe(console.log);

// Combine with other observables
combineLatest([
  store.user.name,
  store.count,
  someOtherObservable$
]).subscribe(([name, count, other]) => { ... });

// Works with any RxJS operator
store.user.pipe(
  switchMap(user => fetchUserDetails(user.id)),
  retry(3)
).subscribe();
```

**Valtio**: No RxJS integration.
```javascript
// Need to create wrapper
import { Observable } from 'rxjs';

const name$ = new Observable(subscriber => {
  const unsub = subscribe(state.user, () => {
    subscriber.next(snapshot(state.user).name);
  });
  return unsub;
});
```

**Redux**: Middleware required.
```javascript
// redux-observable for RxJS
const epic = action$ => action$.pipe(
  ofType('FETCH_USER'),
  mergeMap(action => fetchUser(action.payload))
);
```

**Deep-state-observer**: No RxJS integration.

### 2. Type Safety

**Deepstate**: Full TypeScript inference through the entire path.

```typescript
const store = state({
  user: { name: "Alice", age: 30 },
  items: [{ id: 1, price: 10 }]
});

// All of these are fully typed:
store.user.name.get()           // string
store.user.name.set("Bob")      // (value: string) => void
store.user.age.get()            // number
store.items.at(0)?.price.get()  // number | undefined
store.user.subscribe(u => {})   // u: { name: string, age: number }

// Compile errors:
store.user.name.set(123);       // Error: number not assignable to string
store.user.nonexistent.get();   // Error: property doesn't exist
```

**Valtio**: Good but snapshot typing can be tricky.

```typescript
const state = proxy({ user: { name: "Alice" } });

state.user.name = "Bob";        // Works, typed
const snap = snapshot(state);   // DeepReadonly<...>
snap.user.name = "X";           // Runtime error, not always caught
```

**Redux** (with RTK): Good with toolkit, verbose without.

```typescript
// Redux Toolkit - good
const slice = createSlice({
  name: 'user',
  initialState: { name: "Alice" },
  reducers: {
    setName: (state, action: PayloadAction<string>) => {
      state.name = action.payload;
    }
  }
});

// Raw redux - verbose
interface State { user: { name: string } }
interface Action { type: 'SET_NAME', payload: string }
```

**Deep-state-observer**: Limited - string paths lose type safety.

```typescript
// Path is just a string - no type checking
state.subscribe('user.name', (value) => {
  // value is 'any' unless manually typed
});

state.update('user.naem', 'Bob');  // Typo not caught!
```

### 3. Batching Updates

**Deepstate**: Explicit `update()` function.

```typescript
// Without batching: 2 emissions
store.user.name.set("Bob");
store.user.age.set(31);

// With batching: 1 emission
store.user.update(draft => {
  draft.name.set("Bob");
  draft.age.set(31);
});
```

**Valtio**: Automatic batching in React, manual otherwise.

```javascript
// React: automatic batching via React 18
state.user.name = "Bob";
state.user.age = 31;  // Batched in React render

// Outside React: no automatic batching
```

**Redux**: Single dispatch = single update.

```javascript
// One dispatch, one state update
dispatch(updateUser({ name: "Bob", age: 31 }));

// Multiple dispatches = multiple updates (unless batched)
dispatch(setName("Bob"));
dispatch(setAge(31));  // Two separate updates
```

### 4. Sibling Isolation

**Deepstate**: Architectural guarantee.

```typescript
let nameEmits = 0, ageEmits = 0;
store.user.name.subscribe(() => nameEmits++);
store.user.age.subscribe(() => ageEmits++);

store.user.name.set("Bob");
// nameEmits: 1, ageEmits: 0  ← Guaranteed by architecture
```

**Valtio**: Partial - depends on subscription granularity.

```javascript
// If you subscribe to state.user:
subscribe(state.user, () => { ... });
state.user.name = "Bob";  // Fires
state.user.age = 31;      // Also fires (same proxy)

// Must subscribe separately for isolation:
subscribe(state.user.name, () => { ... });  // Not possible! name is primitive
```

**Redux**: Manual via selectors.

```javascript
// Must use selectors with proper memoization
const selectName = state => state.user.name;
const selectAge = state => state.user.age;

// Even then, selector functions still execute
```

**Deep-state-observer**: Manual via precise paths.

```javascript
state.subscribe('user.name', () => { ... });  // Only name
state.subscribe('user.age', () => { ... });   // Only age
// Works, but O(listeners) matching on every update
```

### 5. Array Handling

**Deepstate**: First-class with reactive `.at()`, `.length`, `.push()`, `.pop()`.

```typescript
const store = state({ items: [{ id: 1, name: "A" }] });

// Reactive access to specific item
store.items.at(0)?.name.subscribe(n => console.log(n));

// Reactive length
store.items.length.subscribe(len => console.log(`Count: ${len}`));

// Mutate items
store.items.push({ id: 2, name: "B" });
store.items.at(1)?.name.set("Beta");
```

**Valtio**: Direct mutation, no reactive indexing.

```javascript
state.items[0].name = "A";  // Works
state.items.push({ id: 2 });  // Works

// No way to subscribe to specific index
subscribe(state.items, () => { ... });  // ALL array changes
```

**Redux**: Immutable updates required.

```javascript
// Must return new array
case 'ADD_ITEM':
  return { ...state, items: [...state.items, action.payload] };
  
case 'UPDATE_ITEM':
  return {
    ...state,
    items: state.items.map((item, i) => 
      i === action.index ? { ...item, ...action.payload } : item
    )
  };
```

**Deep-state-observer**: Wildcard subscriptions.

```javascript
// Subscribe to all items
state.subscribe('items.:index.name', (value, info) => {
  console.log(`Item ${info.params.index} name: ${value}`);
});
```

## When to Use Each

### Use Deepstate When:

1. **You're already using RxJS** - Zero friction, native integration
2. **You need surgical precision** - Subscribe to exact paths without sibling noise
3. **You want TypeScript excellence** - Full inference through entire state tree
4. **Performance at scale matters** - O(depth) vs O(subscribers) complexity
5. **You're building a reactive system** - Combine with other Observables seamlessly

### Use Valtio When:

1. **You want minimal boilerplate** - Just mutate, it works
2. **React is your only consumer** - Great React hooks integration
3. **You prefer mutable DX** - Direct assignment feels natural
4. **Bundle size is critical** - No RxJS dependency

### Use Redux When:

1. **You need time-travel debugging** - Redux DevTools is unmatched
2. **Team familiarity** - Redux patterns are well-known
3. **Middleware ecosystem** - Thunks, sagas, observables
4. **Strict unidirectional flow** - Actions → Reducers → State

### Use Deep-State-Observer When:

1. **You need wildcard subscriptions** - `items.*.price` pattern matching
2. **Framework agnostic** - Works anywhere
3. **Path-based updates** - String paths are your preference

## Unique Deepstate Advantages

### 1. True Observable Identity

Deepstate nodes ARE Observables, not wrappers:

```typescript
// This is the same object
store.user.name === store.user.name  // true (referential stability)

// Works with any Observable consumer
declare function useObservable<T>(obs: Observable<T>): T;
const name = useObservable(store.user.name);

// RxJS interop is native
merge(store.user.name, store.settings.theme).subscribe();
```

### 2. Architectural Sibling Isolation

Not a feature bolted on - it's how the library works:

```typescript
// V1 architecture (like most libraries):
// Root$ → map → distinctUntilChanged → subscriber
// ALL subscribers run their map+distinct on EVERY change

// V2 architecture:
// Leaf$ → subscriber (direct)
// Parent$ = combineLatest(children) 
// Only affected path notifies
```

### 3. Unified Sync/Async

```typescript
// Synchronous
const name = store.user.name.get();

// Asynchronous (same API)
store.user.name.subscribe(name => { ... });

// Transform
store.user.name.pipe(
  map(n => n.toUpperCase()),
  delay(100)
).subscribe();

// Combine sync and async seamlessly
const [name, data] = await firstValueFrom(
  combineLatest([store.user.name, fetchUserData()])
);
```

### 4. Frozen Emissions

Emitted values are deeply frozen - mutations are errors, not silent bugs:

```typescript
store.user.subscribe(user => {
  user.name = "Hacked";  // TypeError: Cannot assign to read only property
});
```

## Conclusion

Deepstate occupies a unique position: it's the only library that provides **O(depth) update complexity** with **native RxJS integration** and **full TypeScript inference**. 

For RxJS users, it's a clear win - no adapters needed, just plug and play.

For others, the trade-off is the RxJS dependency (~12KB gzipped) in exchange for:
- Architectural sibling isolation (not just memoization)
- Native Observable operators (debounce, combine, switch, etc.)
- Predictable performance characteristics at scale

The library is worth existing because it solves the "reactive state + RxJS" problem more elegantly than wrapping valtio/redux with Observables, and provides better performance characteristics than deep-state-observer's O(listeners) matching.
