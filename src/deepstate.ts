import { BehaviorSubject, Observable, Subscription } from "rxjs";
import { distinctUntilChanged, map, take } from "rxjs/operators";

// Symbols for internal access
const PATH = Symbol("path");
const ROOT = Symbol("root");

// Deep freeze an object recursively
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

// Deep equality check for distinctUntilChanged
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }

  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  return keysA.every((key) =>
    deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
  );
}

// Get value at path from object
function getAtPath(obj: unknown, path: PropertyKey[]): unknown {
  let current = obj;
  for (const key of path) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<PropertyKey, unknown>)[key];
  }
  return current;
}

// Set value at path in object (immutably)
function setAtPath<T>(obj: T, path: PropertyKey[], value: unknown): T {
  if (path.length === 0) return value as T;

  const [head, ...tail] = path;
  const current = obj as Record<PropertyKey, unknown>;

  if (Array.isArray(obj)) {
    const newArr = [...obj];
    newArr[head as number] = tail.length === 0 ? value : setAtPath(obj[head as number], tail, value);
    return newArr as T;
  }

  return {
    ...current,
    [head as string]: tail.length === 0 ? value : setAtPath(current[head as string], tail, value),
  } as T;
}

// Type helpers for nested state
type Primitive = string | number | boolean | null | undefined | symbol | bigint;

// Deep readonly type - makes all nested properties readonly
// Using [T] extends [...] to prevent distribution over unions
type DeepReadonly<T> = [T] extends [Primitive]
  ? T
  : [T] extends [Array<infer U>]
    ? ReadonlyArray<DeepReadonly<U>>
    : [T] extends [object]
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

// NonNullable part of T for determining node type
type NonNullablePart<T> = T extends null | undefined ? never : T;

/**
 * A mutable draft of state T.
 * 
 * Mutate this object freely within an `update()` callback.
 * Changes are automatically committed when the callback completes,
 * triggering a single emission to subscribers.
 * 
 * @example
 * ```ts
 * myState.user.update((draft) => {
 *   draft.name = "Alice";      // mutate freely
 *   draft.profile.age = 30;    // nested mutations work too
 * }); // auto-committed here, single emission
 * ```
 */
export type Draft<T> = T;

// RxNode type - using [T] extends [...] to prevent distribution over unions
// This ensures { name: string } | null becomes a single RxObject with nullable set()
// rather than RxObject | RxLeaf union
type RxNode<T, TRoot> = [T] extends [Primitive]
  ? RxLeaf<T, TRoot>
  : [NonNullablePart<T>] extends [Array<infer U>]
    ? RxArray<U, TRoot, T>
    : [NonNullablePart<T>] extends [object]
      ? RxObject<NonNullablePart<T>, TRoot, T>
      : RxLeaf<T, TRoot>;

type RxLeaf<T, TRoot> = Observable<DeepReadonly<T>> & {
  /** Get current value synchronously */
  get(): DeepReadonly<T>;
  /** Set value */
  set(value: T): void;
  /** Subscribe to a single emission, then automatically unsubscribe */
  subscribeOnce(callback: (value: DeepReadonly<T>) => void): Subscription;
  [ROOT]: BehaviorSubject<TRoot>;
  [PATH]: PropertyKey[];
};

// TFull is the full type including null/undefined, T is the array element type
type RxArray<T, TRoot, TFull = T[]> = Observable<DeepReadonly<TFull>> & {
  /** Get current value synchronously */
  get(): DeepReadonly<TFull>;
  /** Set value */
  set(value: TFull): void;
  /** Subscribe to a single emission, then automatically unsubscribe */
  subscribeOnce(callback: (value: DeepReadonly<TFull>) => void): Subscription;
  /**
   * Update using a mutable draft. Mutate the draft freely - changes are
   * automatically committed when the callback completes, triggering a single emission.
   */
  update(callback: (draft: Draft<T[]>) => void): DeepReadonly<TFull>;
  /** Get reactive node for array element at index */
  at(index: number): RxNode<T, TRoot> | undefined;
  /** Get current length */
  length: Observable<number> & { get(): number };
  /** Push items and return new length */
  push(...items: T[]): number;
  /** Pop last item */
  pop(): DeepReadonly<T> | undefined;
  /** Map over current values (non-reactive, use .subscribe for reactive) */
  map<U>(fn: (item: DeepReadonly<T>, index: number) => U): U[];
  /** Filter current values */
  filter(fn: (item: DeepReadonly<T>, index: number) => boolean): ReadonlyArray<DeepReadonly<T>>;
  [ROOT]: BehaviorSubject<TRoot>;
  [PATH]: PropertyKey[];
};

// TFull is the full type including null/undefined, T is the non-nullable object type
type RxObject<T extends object, TRoot, TFull = T> = {
  [K in keyof T]: RxNode<T[K], TRoot>;
} & Observable<DeepReadonly<TFull>> & {
  /** Get current value synchronously */
  get(): DeepReadonly<TFull>;
  /** Set value */
  set(value: TFull): void;
  subscribe: Observable<DeepReadonly<TFull>>["subscribe"];
  /** Subscribe to a single emission, then automatically unsubscribe */
  subscribeOnce(callback: (value: DeepReadonly<TFull>) => void): Subscription;
  /**
   * Update using a mutable draft. Mutate the draft freely - changes are
   * automatically committed when the callback completes, triggering a single emission.
   */
  update(callback: (draft: Draft<T>) => void): DeepReadonly<TFull>;
  [ROOT]: BehaviorSubject<TRoot>;
  [PATH]: PropertyKey[];
};

export type RxState<T extends object> = RxObject<T, T, T>;

// Create a reactive node at a given path
function createNode<T, TRoot>(
  root$: BehaviorSubject<TRoot>,
  path: PropertyKey[],
  initialValue: T
): RxNode<T, TRoot> {
  // Create the observable for this path
  const node$ = root$.pipe(
    map((state) => deepFreeze(getAtPath(state, path)) as T),
    distinctUntilChanged(deepEqual)
  );

  // Cache for child nodes
  const childCache = new Map<PropertyKey, unknown>();

  const getChild = (key: PropertyKey): unknown => {
    if (!childCache.has(key)) {
      const currentValue = getAtPath(root$.getValue(), path) as Record<PropertyKey, unknown>;
      const childValue = currentValue?.[key];
      childCache.set(key, createNode(root$, [...path, key], childValue));
    }
    return childCache.get(key);
  };

  // Base methods for all nodes
  const baseMethods = {
    get: () => getAtPath(root$.getValue(), path) as T,
    set: (value: T) => {
      root$.next(setAtPath(root$.getValue(), path, value));
    },
    subscribeOnce: (callback: (value: T) => void): Subscription => {
      return node$.pipe(take(1)).subscribe(callback as (value: unknown) => void);
    },
    update: (callback: (draft: T) => void): T => {
      const draft = structuredClone(getAtPath(root$.getValue(), path)) as T;
      callback(draft);
      root$.next(setAtPath(root$.getValue(), path, draft));
      return deepFreeze(draft) as T;
    },
    [ROOT]: root$,
    [PATH]: path,
  };

  // Check if value is an array
  if (Array.isArray(initialValue)) {
    const arrayMethods = {
      at: (index: number) => getChild(index),
      get length() {
        const len$ = root$.pipe(
          map((state) => (getAtPath(state, path) as unknown[])?.length ?? 0),
          distinctUntilChanged()
        );
        return Object.assign(len$, {
          get: () => (getAtPath(root$.getValue(), path) as unknown[])?.length ?? 0,
        });
      },
      push: (...items: unknown[]) => {
        const current = (getAtPath(root$.getValue(), path) as unknown[]) ?? [];
        const newArr = [...current, ...items];
        root$.next(setAtPath(root$.getValue(), path, newArr));
        return newArr.length;
      },
      pop: () => {
        const current = (getAtPath(root$.getValue(), path) as unknown[]) ?? [];
        if (current.length === 0) return undefined;
        const last = current[current.length - 1];
        root$.next(setAtPath(root$.getValue(), path, current.slice(0, -1)));
        return last;
      },
      map: <U>(fn: (item: unknown, index: number) => U): U[] => {
        const current = (getAtPath(root$.getValue(), path) as unknown[]) ?? [];
        return current.map(fn);
      },
      filter: (fn: (item: unknown, index: number) => boolean): unknown[] => {
        const current = (getAtPath(root$.getValue(), path) as unknown[]) ?? [];
        return current.filter(fn);
      },
    };

    return Object.assign(node$, baseMethods, arrayMethods) as unknown as RxNode<T, TRoot>;
  }

  // Check if value is a plain object
  if (initialValue !== null && typeof initialValue === "object") {
    const objectProxy = new Proxy(node$ as object, {
      get(_target, prop: PropertyKey) {
        // Observable methods
        if (prop === "subscribe") return node$.subscribe.bind(node$);
        if (prop === "pipe") return node$.pipe.bind(node$);
        if (prop === "forEach") return node$.forEach.bind(node$);

        // Base methods
        if (prop === "get") return baseMethods.get;
        if (prop === "set") return baseMethods.set;
        if (prop === "subscribeOnce") return baseMethods.subscribeOnce;
        if (prop === "update") return baseMethods.update;
        if (prop === ROOT) return root$;
        if (prop === PATH) return path;

        // Symbol.observable for RxJS interop
        if (prop === Symbol.observable || prop === "@@observable") {
          return () => node$;
        }

        // Child properties
        const currentValue = getAtPath(root$.getValue(), path) as Record<PropertyKey, unknown>;
        if (currentValue && prop in currentValue) {
          return getChild(prop);
        }

        // Fallback to observable method
        if (prop in node$) {
          const val = (node$ as unknown as Record<PropertyKey, unknown>)[prop];
          return typeof val === "function" ? val.bind(node$) : val;
        }

        return undefined;
      },

      has(_target, prop) {
        const currentValue = getAtPath(root$.getValue(), path) as Record<PropertyKey, unknown>;
        return (
          prop in (currentValue ?? {}) ||
          prop === "subscribe" ||
          prop === "get" ||
          prop === "set"
        );
      },

      ownKeys() {
        const currentValue = getAtPath(root$.getValue(), path) as Record<PropertyKey, unknown>;
        return Object.keys(currentValue ?? {});
      },

      getOwnPropertyDescriptor(_target, prop) {
        const currentValue = getAtPath(root$.getValue(), path) as Record<PropertyKey, unknown>;
        if (currentValue && prop in currentValue) {
          return { enumerable: true, configurable: true };
        }
        return undefined;
      },
    });

    return objectProxy as RxNode<T, TRoot>;
  }

  // Primitive value - just return observable with base methods
  return Object.assign(node$, baseMethods) as RxNode<T, TRoot>;
}

export function state<T extends object>(initialState: T): RxState<T> {
  const root$ = new BehaviorSubject<T>(structuredClone(initialState));
  return createNode(root$, [], initialState) as RxState<T>;
}
