/**
 * deepstate v2 - Nested BehaviorSubjects Architecture
 *
 * Each property has its own observable that emits standalone.
 * Parent notifications flow upward automatically via RxJS subscriptions.
 * Siblings are never notified.
 *
 * Architecture:
 * - Leaves (primitives): BehaviorSubject is source of truth
 * - Objects: combineLatest(children) derives the observable, children are source of truth
 * - Arrays: BehaviorSubject<T[]> is source of truth, children are projections
 */

import { BehaviorSubject, Observable, combineLatest, of, Subscription } from "rxjs";
import {
  map,
  distinctUntilChanged,
  shareReplay,
  take,
  filter,
} from "rxjs/operators";

// =============================================================================
// Counters for performance comparison
// =============================================================================

export let distinctCallCount = 0;
export function resetDistinctCallCount() {
  distinctCallCount = 0;
}

// Wrap distinctUntilChanged to count calls
function countedDistinctUntilChanged<T>(compareFn?: (a: T, b: T) => boolean) {
  return distinctUntilChanged<T>((a, b) => {
    distinctCallCount++;
    if (compareFn) return compareFn(a, b);
    return a === b;
  });
}

// =============================================================================
// Deep Freeze
// =============================================================================

function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") return obj;
  if (Object.isFrozen(obj)) return obj;

  Object.freeze(obj);

  if (Array.isArray(obj)) {
    obj.forEach((item) => deepFreeze(item));
  } else {
    Object.keys(obj).forEach((key) => {
      deepFreeze((obj as Record<string, unknown>)[key]);
    });
  }

  return obj;
}

// =============================================================================
// Types
// =============================================================================

type Primitive = string | number | boolean | null | undefined | symbol | bigint;

/**
 * Deep readonly type - makes all nested properties readonly.
 * Used for return types of get() and subscribe() to prevent accidental mutations.
 */
export type DeepReadonly<T> = [T] extends [Primitive]
  ? T
  : [T] extends [Array<infer U>]
    ? ReadonlyArray<DeepReadonly<U>>
    : [T] extends [object]
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

/**
 * A mutable draft of state T for use in update callbacks.
 */
export type Draft<T> = T;

// Internal node interface - what every node must implement
interface NodeCore<T> {
  readonly $: Observable<T>;
  get(): T;
  set(value: T): void;
  subscribeOnce?(callback: (value: T) => void): Subscription;
}

// Symbols for internal access
const NODE = Symbol("node");

// External API types
type RxLeaf<T> = Observable<DeepReadonly<T>> & {
  /** Get current value synchronously */
  get(): DeepReadonly<T>;
  /** Set value */
  set(value: T): void;
  /** Subscribe to a single emission, then automatically unsubscribe */
  subscribeOnce(callback: (value: DeepReadonly<T>) => void): Subscription;
  [NODE]: NodeCore<T>;
};

type RxObject<T extends object> = {
  [K in keyof T]: RxNodeFor<T[K]>;
} & Observable<DeepReadonly<T>> & {
  /** Get current value synchronously */
  get(): DeepReadonly<T>;
  /** Set value */
  set(value: T): void;
  /** 
   * Update multiple properties in a single emission.
   * The callback receives the reactive state object - use .set() on properties to update them.
   * All changes are batched into a single emission.
   * @example
   * store.user.update(draft => {
   *   draft.name.set("Bob");
   *   draft.age.set(31);
   * });
   */
  update(callback: (draft: RxObject<T>) => void): DeepReadonly<T>;
  /** Subscribe to a single emission, then automatically unsubscribe */
  subscribeOnce(callback: (value: DeepReadonly<T>) => void): Subscription;
  [NODE]: NodeCore<T>;
};

type RxArray<T> = Observable<DeepReadonly<T[]>> & {
  /** Get current value synchronously */
  get(): DeepReadonly<T[]>;
  /** Set value */
  set(value: T[]): void;
  /** 
   * Update array in a single emission.
   * The callback receives the reactive array - use .at(), .push(), .pop() etc to update.
   * All changes are batched into a single emission.
   * @example
   * store.items.update(draft => {
   *   draft.at(0)?.name.set("Updated");
   *   draft.push({ id: 2, name: "New" });
   * });
   */
  update(callback: (draft: RxArray<T>) => void): DeepReadonly<T[]>;
  /** Subscribe to a single emission, then automatically unsubscribe */
  subscribeOnce(callback: (value: DeepReadonly<T[]>) => void): Subscription;
  /** Get reactive node for array element at index */
  at(index: number): RxNodeFor<T> | undefined;
  /** Get current length (also observable) */
  length: Observable<number> & { get(): number };
  /** Push items and return new length */
  push(...items: T[]): number;
  /** Pop last item */
  pop(): DeepReadonly<T> | undefined;
  /** Map over current values (non-reactive, use .subscribe for reactive) */
  map<U>(fn: (item: DeepReadonly<T>, index: number) => U): U[];
  /** Filter current values */
  filter(fn: (item: DeepReadonly<T>, index: number) => boolean): DeepReadonly<T>[];
  [NODE]: NodeCore<T[]>;
};

type RxNodeFor<T> = [T] extends [Primitive]
  ? RxLeaf<T>
  : [T] extends [Array<infer U>]
    ? RxArray<U>
    : [T] extends [object]
      ? RxObject<T>
      : RxLeaf<T>;

export type RxState<T extends object> = RxObject<T>;

// =============================================================================
// Node Creation
// =============================================================================

function createLeafNode<T extends Primitive>(value: T): NodeCore<T> {
  const subject$ = new BehaviorSubject<T>(value);
  
  // Use distinctUntilChanged to prevent duplicate emissions for same value
  const distinct$ = subject$.pipe(
    distinctUntilChanged(),
    shareReplay(1)
  );
  // Keep hot
  distinct$.subscribe();

  return {
    $: distinct$,
    get: () => subject$.getValue(),
    set: (v: T) => subject$.next(v),
    subscribeOnce: (callback: (value: T) => void): Subscription => {
      return distinct$.pipe(take(1)).subscribe(callback);
    },
  };
}

function createObjectNode<T extends object>(value: T): NodeCore<T> & { 
  children: Map<string, NodeCore<unknown>>;
  lock(): void;
  unlock(): void;
} {
  const keys = Object.keys(value) as (keyof T)[];
  const children = new Map<keyof T, NodeCore<unknown>>();

  // Create child nodes for each property
  for (const key of keys) {
    children.set(key, createNodeForValue(value[key]));
  }

  // Helper to get current value from children
  const getCurrentValue = (): T => {
    const result = {} as T;
    for (const [key, child] of children) {
      (result as Record<string, unknown>)[key as string] = child.get();
    }
    return result;
  };

  // Handle empty objects
  if (keys.length === 0) {
    const empty$ = of(value).pipe(shareReplay(1));
    return {
      $: empty$,
      children: children as Map<string, NodeCore<unknown>>,
      get: () => ({}) as T,
      set: () => {}, // No-op for empty objects
      lock: () => {}, // No-op for empty objects
      unlock: () => {}, // No-op for empty objects
    };
  }

  // Lock for batching updates - when false, emissions are filtered out
  const lock$ = new BehaviorSubject<boolean>(true);

  // Derive observable from children + lock using combineLatest
  const childObservables = keys.map((key) => children.get(key)!.$);

  const $ = combineLatest([...childObservables, lock$] as Observable<unknown>[]).pipe(
    // Only emit when unlocked (lock is last element)
    filter((values) => values[values.length - 1] === true),
    // Remove lock value from output, reconstruct object
    map((values) => {
      const result = {} as T;
      keys.forEach((key, i) => {
        (result as Record<string, unknown>)[key as string] = values[i];
      });
      return result;
    }),
    shareReplay(1)
  );

  // Force subscription to make it hot (so emissions work even before external subscribers)
  $.subscribe();

  // Create a version that freezes on emission
  const frozen$ = $.pipe(map(deepFreeze));

  return {
    $: frozen$,
    children: children as Map<string, NodeCore<unknown>>,
    get: () => deepFreeze(getCurrentValue()),
    set: (v: T) => {
      for (const [key, child] of children) {
        child.set(v[key]);
      }
    },
    lock: () => lock$.next(false),
    unlock: () => lock$.next(true),
    // Note: update() is implemented in wrapWithProxy since it needs the proxy reference
    subscribeOnce: (callback: (value: T) => void): Subscription => {
      return frozen$.pipe(take(1)).subscribe(callback);
    },
  };
}

function createArrayNode<T>(value: T[]): NodeCore<T[]> & {
  at(index: number): NodeCore<T> | undefined;
  childCache: Map<number, NodeCore<T>>;
  length$: Observable<number> & { get(): number };
  push(...items: T[]): number;
  pop(): T | undefined;
  mapItems<U>(fn: (item: T, index: number) => U): U[];
  filterItems(fn: (item: T, index: number) => boolean): T[];
  lock(): void;
  unlock(): void;
} {
  const subject$ = new BehaviorSubject<T[]>([...value]);
  const childCache = new Map<number, NodeCore<T>>();

  const createChildProjection = (index: number): NodeCore<T> => {
    const currentValue = subject$.getValue()[index];

    // If the element is an object, we need nested access
    // Create a "projection node" that reads/writes through the parent array
    if (currentValue !== null && typeof currentValue === "object") {
      return createArrayElementObjectNode(
        subject$ as unknown as BehaviorSubject<unknown[]>,
        index,
        currentValue as object
      ) as unknown as NodeCore<T>;
    }

    // Primitive element - simple projection
    const element$ = subject$.pipe(
      map((arr) => arr[index]),
      countedDistinctUntilChanged(),
      shareReplay(1)
    );

    // Force hot
    element$.subscribe();

    return {
      $: element$ as Observable<T>,
      get: () => subject$.getValue()[index] as T,
      set: (v: T) => {
        const arr = [...subject$.getValue()];
        arr[index] = v;
        subject$.next(arr);
      },
      subscribeOnce: (callback: (value: T) => void): Subscription => {
        return element$.pipe(take(1)).subscribe(callback as (value: unknown) => void);
      },
    };
  };

  // Lock for batching updates - when false, emissions are filtered out
  const lock$ = new BehaviorSubject<boolean>(true);

  // Create observable that respects lock
  const locked$ = combineLatest([subject$, lock$]).pipe(
    filter(([_, unlocked]) => unlocked),
    map(([arr, _]) => arr),
    map(deepFreeze),
    shareReplay(1)
  );
  locked$.subscribe(); // Keep hot

  // Length observable (also respects lock)
  const length$ = locked$.pipe(
    map((arr) => arr.length),
    distinctUntilChanged(),
    shareReplay(1)
  );
  length$.subscribe(); // Keep hot

  const lengthWithGet = Object.assign(length$, {
    get: () => subject$.getValue().length,
  });

  return {
    $: locked$ as Observable<T[]>,
    childCache,
    get: () => deepFreeze([...subject$.getValue()]) as T[],
    set: (v: T[]) => {
      // Clear child cache when array is replaced
      childCache.clear();
      subject$.next([...v]);
    },
    subscribeOnce: (callback: (value: T[]) => void): Subscription => {
      return locked$.pipe(take(1)).subscribe(callback);
    },
    at: (index: number) => {
      const arr = subject$.getValue();
      if (index < 0 || index >= arr.length) return undefined;

      if (!childCache.has(index)) {
        childCache.set(index, createChildProjection(index));
      }
      return childCache.get(index);
    },
    length$: lengthWithGet,
    push: (...items: T[]): number => {
      const current = subject$.getValue();
      const newArr = [...current, ...items];
      subject$.next(newArr);
      return newArr.length;
    },
    pop: (): T | undefined => {
      const current = subject$.getValue();
      if (current.length === 0) return undefined;
      const last = current[current.length - 1];
      // Clear cached node for popped index
      childCache.delete(current.length - 1);
      subject$.next(current.slice(0, -1));
      return deepFreeze(last) as T;
    },
    mapItems: <U>(fn: (item: T, index: number) => U): U[] => {
      return subject$.getValue().map((item, i) => fn(deepFreeze(item) as T, i));
    },
    filterItems: (fn: (item: T, index: number) => boolean): T[] => {
      return deepFreeze(subject$.getValue().filter((item, i) => fn(deepFreeze(item) as T, i))) as T[];
    },
    lock: () => lock$.next(false),
    unlock: () => lock$.next(true),
    // Note: update() is implemented in wrapWithProxy since it needs the proxy reference
  };
}

// Special node for object elements within arrays
// These project from the parent array but support nested property access
function createArrayElementObjectNode<T extends object>(
  parentArray$: BehaviorSubject<unknown[]>,
  index: number,
  initialValue: T
): NodeCore<T> & { children: Map<string, NodeCore<unknown>> } {
  const keys = Object.keys(initialValue) as (keyof T)[];
  const children = new Map<string, NodeCore<unknown>>();

  // Create child nodes that project through the array
  for (const key of keys) {
    children.set(
      key as string,
      createArrayElementPropertyNode(parentArray$, index, key as string, initialValue[key])
    );
  }

  // Handle empty objects
  if (keys.length === 0) {
    const element$ = parentArray$.pipe(
      map((arr) => arr[index] as T),
      countedDistinctUntilChanged(),
      shareReplay(1)
    );
    element$.subscribe();

    return {
      $: element$,
      children,
      get: () => parentArray$.getValue()[index] as T,
      set: (v: T) => {
        const arr = [...parentArray$.getValue()];
        arr[index] = v;
        parentArray$.next(arr);
      },
    };
  }

  // Derive from children
  const childObservables = keys.map((key) => children.get(key as string)!.$);

  const $ = combineLatest(childObservables).pipe(
    map((values) => {
      const result = {} as T;
      keys.forEach((key, i) => {
        (result as Record<string, unknown>)[key as string] = values[i];
      });
      return result;
    }),
    countedDistinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
    shareReplay(1)
  );

  $.subscribe();

  return {
    $,
    children,
    get: () => {
      const result = {} as T;
      for (const [key, child] of children) {
        (result as Record<string, unknown>)[key] = child.get();
      }
      return result;
    },
    set: (v: T) => {
      // Update parent array directly
      const arr = [...parentArray$.getValue()];
      arr[index] = v;
      parentArray$.next(arr);
      // Note: This causes children to be out of sync until they re-read from parent
      // For simplicity, we update children too
      for (const [key, child] of children) {
        child.set((v as Record<string, unknown>)[key]);
      }
    },
  };
}

// Node for a property of an object inside an array
function createArrayElementPropertyNode<T>(
  parentArray$: BehaviorSubject<unknown[]>,
  index: number,
  key: string,
  initialValue: T
): NodeCore<T> {
  // If nested object/array, recurse
  if (initialValue !== null && typeof initialValue === "object") {
    if (Array.isArray(initialValue)) {
      // Nested array inside array element - create projection
      return createNestedArrayProjection(parentArray$, index, key, initialValue) as unknown as NodeCore<T>;
    }
    // Nested object inside array element
    return createNestedObjectProjection(parentArray$, index, key, initialValue as object) as unknown as NodeCore<T>;
  }

  // Primitive property
  const prop$ = parentArray$.pipe(
    map((arr) => (arr[index] as Record<string, unknown>)?.[key] as T),
    countedDistinctUntilChanged(),
    shareReplay(1)
  );

  prop$.subscribe();

  return {
    $: prop$,
    get: () => {
      const arr = parentArray$.getValue();
      return (arr[index] as Record<string, unknown>)?.[key] as T;
    },
    set: (v: T) => {
      const arr = [...parentArray$.getValue()];
      arr[index] = { ...(arr[index] as object), [key]: v };
      parentArray$.next(arr);
    },
  };
}

// Nested object projection (object property inside array element)
function createNestedObjectProjection<T extends object>(
  parentArray$: BehaviorSubject<unknown[]>,
  index: number,
  key: string,
  initialValue: T
): NodeCore<T> & { children: Map<string, NodeCore<unknown>> } {
  const keys = Object.keys(initialValue) as (keyof T)[];
  const children = new Map<string, NodeCore<unknown>>();

  // For each property of the nested object
  for (const nestedKey of keys) {
    const nestedInitial = initialValue[nestedKey];

    // Create a projection for this nested property
    const nested$ = parentArray$.pipe(
      map((arr) => {
        const element = arr[index] as Record<string, unknown>;
        const obj = element?.[key] as Record<string, unknown>;
        return obj?.[nestedKey as string];
      }),
      countedDistinctUntilChanged(),
      shareReplay(1)
    );
    nested$.subscribe();

    children.set(nestedKey as string, {
      $: nested$,
      get: () => {
        const arr = parentArray$.getValue();
        const element = arr[index] as Record<string, unknown>;
        const obj = element?.[key] as Record<string, unknown>;
        return obj?.[nestedKey as string];
      },
      set: (v: unknown) => {
        const arr = [...parentArray$.getValue()];
        const element = { ...(arr[index] as object) } as Record<string, unknown>;
        element[key] = { ...(element[key] as object), [nestedKey as string]: v };
        arr[index] = element;
        parentArray$.next(arr);
      },
    });
  }

  // Derive observable from children or parent
  const obj$ = parentArray$.pipe(
    map((arr) => (arr[index] as Record<string, unknown>)?.[key] as T),
    countedDistinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
    shareReplay(1)
  );
  obj$.subscribe();

  return {
    $: obj$,
    children,
    get: () => {
      const arr = parentArray$.getValue();
      return (arr[index] as Record<string, unknown>)?.[key] as T;
    },
    set: (v: T) => {
      const arr = [...parentArray$.getValue()];
      arr[index] = { ...(arr[index] as object), [key]: v };
      parentArray$.next(arr);
    },
  };
}

// Nested array projection (array property inside array element)
function createNestedArrayProjection<T>(
  parentArray$: BehaviorSubject<unknown[]>,
  index: number,
  key: string,
  initialValue: T[]
): NodeCore<T[]> {
  const arr$ = parentArray$.pipe(
    map((arr) => (arr[index] as Record<string, unknown>)?.[key] as T[]),
    countedDistinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
    shareReplay(1)
  );
  arr$.subscribe();

  return {
    $: arr$,
    get: () => {
      const arr = parentArray$.getValue();
      return (arr[index] as Record<string, unknown>)?.[key] as T[];
    },
    set: (v: T[]) => {
      const arr = [...parentArray$.getValue()];
      arr[index] = { ...(arr[index] as object), [key]: v };
      parentArray$.next(arr);
    },
  };
}

// Factory to create the right node type
function createNodeForValue<T>(value: T): NodeCore<T> {
  if (value === null || typeof value !== "object") {
    return createLeafNode(value as Primitive) as NodeCore<T>;
  }
  if (Array.isArray(value)) {
    return createArrayNode(value) as unknown as NodeCore<T>;
  }
  return createObjectNode(value as object) as unknown as NodeCore<T>;
}

// =============================================================================
// Proxy Wrapper
// =============================================================================

function wrapWithProxy<T>(node: NodeCore<T>): RxNodeFor<T> {
  const value = node.get();

  // Primitive - just attach methods to observable
  if (value === null || typeof value !== "object") {
    return Object.assign(node.$, {
      get: node.get,
      set: node.set,
      subscribe: node.$.subscribe.bind(node.$),
      pipe: node.$.pipe.bind(node.$),
      subscribeOnce: node.subscribeOnce,
      [NODE]: node,
    }) as RxNodeFor<T>;
  }

  // Array
  if (Array.isArray(value)) {
    const arrayNode = node as unknown as NodeCore<unknown[]> & {
      at(index: number): NodeCore<unknown> | undefined;
      childCache: Map<number, NodeCore<unknown>>;
      length$: Observable<number> & { get(): number };
      push(...items: unknown[]): number;
      pop(): unknown | undefined;
      mapItems<U>(fn: (item: unknown, index: number) => U): U[];
      filterItems(fn: (item: unknown, index: number) => boolean): unknown[];
      lock(): void;
      unlock(): void;
    };

    // Create the wrapped result first so we can reference it in update
    const wrapped = Object.assign(node.$, {
      get: node.get,
      set: node.set,
      subscribe: node.$.subscribe.bind(node.$),
      pipe: node.$.pipe.bind(node.$),
      subscribeOnce: node.subscribeOnce,
      at: (index: number) => {
        const child = arrayNode.at(index);
        if (!child) return undefined;
        return wrapWithProxy(child);
      },
      length: arrayNode.length$,
      push: arrayNode.push,
      pop: arrayNode.pop,
      map: arrayNode.mapItems,
      filter: arrayNode.filterItems,
      update: (callback: (draft: unknown[]) => void): unknown[] => {
        arrayNode.lock();  // Lock - suppress emissions
        try {
          callback(wrapped as unknown as unknown[]);  // Pass wrapped array so user can use .at(), .push(), etc.
        } finally {
          arrayNode.unlock();  // Unlock - emit final state
        }
        return node.get() as unknown[];
      },
      [NODE]: node,
    });

    return wrapped as unknown as RxNodeFor<T>;
  }

  // Object - use Proxy for property access
  const objectNode = node as unknown as NodeCore<object> & {
    children?: Map<string, NodeCore<unknown>>;
    lock?(): void;
    unlock?(): void;
  };

  // Create update function that has access to the proxy (defined after proxy creation)
  let updateFn: ((callback: (draft: object) => void) => object) | undefined;

  const proxy = new Proxy(node.$ as object, {
    get(target, prop: PropertyKey) {
      // Observable methods
      if (prop === "subscribe") return node.$.subscribe.bind(node.$);
      if (prop === "pipe") return node.$.pipe.bind(node.$);
      if (prop === "forEach") return (node.$ as any).forEach?.bind(node.$);

      // Node methods
      if (prop === "get") return node.get;
      if (prop === "set") return node.set;
      if (prop === "update") return updateFn;
      if (prop === "subscribeOnce") return node.subscribeOnce;
      if (prop === NODE) return node;

      // Symbol.observable for RxJS interop
      if (prop === Symbol.observable || prop === "@@observable") {
        return () => node.$;
      }

      // Child property access
      if (objectNode.children && typeof prop === "string") {
        const child = objectNode.children.get(prop);
        if (child) {
          return wrapWithProxy(child);
        }
      }

      // Fallback to observable properties
      if (prop in target) {
        const val = (target as Record<PropertyKey, unknown>)[prop];
        return typeof val === "function" ? val.bind(target) : val;
      }

      return undefined;
    },

    has(target, prop) {
      if (objectNode.children && typeof prop === "string") {
        return objectNode.children.has(prop);
      }
      return prop in target;
    },

    ownKeys() {
      if (objectNode.children) {
        return Array.from(objectNode.children.keys());
      }
      return [];
    },

    getOwnPropertyDescriptor(target, prop) {
      if (objectNode.children && typeof prop === "string" && objectNode.children.has(prop)) {
        return { enumerable: true, configurable: true };
      }
      return undefined;
    },
  });

  // Now define update function with access to proxy
  if (objectNode.lock && objectNode.unlock) {
    updateFn = (callback: (draft: object) => void): object => {
      objectNode.lock!();  // Lock - suppress emissions
      try {
        callback(proxy as object);  // Pass the proxy so user can call .set() on children
      } finally {
        objectNode.unlock!();  // Unlock - emit final state
      }
      return node.get() as object;
    };
  }

  return proxy as RxNodeFor<T>;
}

// =============================================================================
// Public API
// =============================================================================

export function state<T extends object>(initialState: T): RxState<T> {
  const node = createObjectNode(initialState);
  return wrapWithProxy(node as NodeCore<T>) as RxState<T>;
}
