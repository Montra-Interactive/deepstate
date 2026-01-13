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

// =============================================================================
// Debug Context
// =============================================================================

interface DebugContext {
  enabled: boolean;
  storeName?: string;
}

function createDebugLog(ctx: DebugContext) {
  return (path: string, action: string, oldValue: unknown, newValue: unknown) => {
    if (!ctx.enabled) return;
    
    const prefix = ctx.storeName 
      ? `[deepstate:${ctx.storeName}]` 
      : '[deepstate]';
    
    const formatValue = (v: unknown): string => {
      if (v === undefined) return 'undefined';
      if (v === null) return 'null';
      if (typeof v === 'object') {
        try {
          const str = JSON.stringify(v);
          return str.length > 50 ? str.slice(0, 50) + '...' : str;
        } catch {
          return '[circular]';
        }
      }
      return String(v);
    };
    
    console.log(`${prefix} ${action} ${path}: ${formatValue(oldValue)} → ${formatValue(newValue)}`);
  };
}

type DebugLogFn = ReturnType<typeof createDebugLog>;

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

// Type utilities for nullable object detection
type NonNullablePart<T> = T extends null | undefined ? never : T;

// Check if T includes null or undefined
type HasNull<T> = null extends T ? true : false;
type HasUndefined<T> = undefined extends T ? true : false;
type IsNullish<T> = HasNull<T> extends true ? true : HasUndefined<T>;

// Check if the non-nullable part is an object (but not array)
type NonNullPartIsObject<T> = NonNullablePart<T> extends object
  ? NonNullablePart<T> extends Array<unknown>
    ? false
    : true
  : false;

// A nullable object is: has null/undefined in union AND non-null part is an object
type IsNullableObject<T> = IsNullish<T> extends true
  ? NonNullPartIsObject<T>
  : false;

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

/**
 * RxNullable - For properties typed as `{ ... } | null` or `{ ... } | undefined`
 * 
 * The node is always present at runtime, enabling deep subscription:
 * - You can subscribe to `store.user.name` even when `user` is null
 * - The subscription will emit `undefined` while user is null
 * - Once user is set to an object, the subscription will emit the actual name value
 * 
 * @example
 * const store = state<{ user: { name: string } | null }>({ user: null });
 * 
 * // Deep subscription works even when user is null
 * store.user.name.subscribe(name => {
 *   console.log(name); // undefined when user is null, actual value when set
 * });
 * 
 * store.user.get();                    // null
 * store.user.set({ name: "Alice" });   // Now name subscription emits "Alice"
 * store.user.name.get();               // "Alice"
 * store.user.name.set("Bob");          // Works!
 */
type RxNullable<T, TNonNull extends object = NonNullablePart<T> & object> = Observable<DeepReadonly<T>> & {
  /** Get current value (may be null/undefined) */
  get(): DeepReadonly<T>;
  /** Set value (can be null/undefined or the full object) */
  set(value: T): void;
  /** Subscribe to a single emission, then automatically unsubscribe */
  subscribeOnce(callback: (value: DeepReadonly<T>) => void): Subscription;
  /**
   * Update multiple properties in a single emission.
   * @example
   * store.user.update(user => {
   *   user.name.set("Bob");
   *   user.age.set(31);
   * });
   */
  update(callback: (draft: RxObject<TNonNull>) => void): DeepReadonly<T>;
  [NODE]: NodeCore<T>;
} & {
  /** 
   * Child properties - always accessible, even when parent value is null.
   * When parent is null, children emit undefined. When parent has a value,
   * children emit their actual values.
   */
  [K in keyof TNonNull]: RxNullableChild<TNonNull[K]>;
};

/**
 * Type for children of a nullable object.
 * Children are wrapped to handle the case where parent is null:
 * - When parent is null: get() returns undefined, subscribe emits undefined
 * - When parent has value: behaves like normal RxNodeFor
 */
type RxNullableChild<T> = 
  // For nested nullable objects, use RxNullable (allows further deep subscription)
  IsNullableObject<T> extends true
    ? RxNullable<T>
  // For primitives, wrap with undefined union since parent might be null
  : [T] extends [Primitive]
    ? RxLeaf<T | undefined>
  // For arrays under nullable parent
  : [T] extends [Array<infer U>]
    ? RxArray<U> | RxLeaf<undefined>
  // For objects under nullable parent  
  : [T] extends [object]
    ? RxNullableChildObject<T>
  // Fallback
  : RxLeaf<T | undefined>;

/**
 * Type for object children under a nullable parent.
 * The object itself might be undefined (if parent is null), but if present
 * it has all the normal object methods and children.
 */
type RxNullableChildObject<T extends object> = Observable<DeepReadonly<T> | undefined> & {
  get(): DeepReadonly<T> | undefined;
  set(value: T): void;
  subscribeOnce(callback: (value: DeepReadonly<T> | undefined) => void): Subscription;
  [NODE]: NodeCore<T | undefined>;
} & {
  [K in keyof T]: RxNullableChild<T[K]>;
};

type RxNodeFor<T> = 
  // First: check for nullable object (e.g., { name: string } | null)
  IsNullableObject<T> extends true
    ? RxNullable<T>
  // Then: primitives (including plain null/undefined)
  : [T] extends [Primitive]
    ? RxLeaf<T>
  // Then: arrays
  : [T] extends [Array<infer U>]
    ? RxArray<U>
  // Then: plain objects
  : [T] extends [object]
    ? RxObject<T>
  // Fallback
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
  // Pass maybeNullable: true so null values get NullableNodeCore
  // which can be upgraded to objects later
  for (const key of keys) {
    children.set(key, createNodeForValue(value[key], true));
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

// Symbol to mark nullable nodes
const NULLABLE_NODE = Symbol("nullableNode");

// Interface for nullable object nodes
interface NullableNodeCore<T> extends NodeCore<T> {
  [NULLABLE_NODE]: true;
  children: Map<string, NodeCore<unknown>> | null;
  /**
   * Gets or creates a child node for the given key.
   * If the parent is null and the child doesn't exist yet, creates a "pending" child
   * that derives from the parent and emits undefined until the parent is set to an object.
   */
  getChild(key: string): NodeCore<unknown> | undefined;
  /**
   * Gets or creates a child node that supports deep subscription.
   * Unlike getChild, this always returns a node (creating one if needed) so that
   * subscriptions work even when the parent is null.
   */
  getOrCreateChild(key: string): NodeCore<unknown>;
  lock(): void;
  unlock(): void;
  isNull(): boolean;
}

/**
 * Creates a node for nullable object types like `{ name: string } | null`
 * 
 * When value is null: no children exist, child access returns undefined
 * When value is set to object: children are created lazily from the object's keys
 */
function createNullableObjectNode<T>(
  initialValue: T
): NullableNodeCore<T> {
  // Subject holds the raw value (null or object)
  const subject$ = new BehaviorSubject<T>(initialValue);
  
  // Children are created lazily when we have an actual object
  let children: Map<string, NodeCore<unknown>> | null = null;
  
  // Pending children - created for deep subscription before parent has a value
  // These are "projection" nodes that derive from the parent observable
  const pendingChildren = new Map<string, NodeCore<unknown>>();
  
  // Lock for batching updates
  const lock$ = new BehaviorSubject<boolean>(true);
  
  // Build/rebuild children from an object value
  const buildChildren = (obj: object) => {
    const keys = Object.keys(obj);
    children = new Map();
    
    for (const key of keys) {
      children.set(key, createNodeForValue((obj as Record<string, unknown>)[key]));
    }
  };
  
  // Initialize children if starting with an object
  if (initialValue !== null && initialValue !== undefined && typeof initialValue === "object") {
    buildChildren(initialValue);
  }
  
  // Helper to get current value
  const getCurrentValue = (): T => {
    const raw = subject$.getValue();
    if (raw === null || raw === undefined || !children) {
      return raw;
    }
    // Build value from children
    const result = {} as Record<string, unknown>;
    for (const [key, child] of children) {
      result[key] = child.get();
    }
    return result as T;
  };
  
  // Observable that emits the current value, respecting lock
  const $ = combineLatest([subject$, lock$]).pipe(
    filter(([_, unlocked]) => unlocked),
    map(([value, _]) => {
      if (value === null || value === undefined || !children) {
        return value;
      }
      // Build from children for consistency
      const result = {} as Record<string, unknown>;
      for (const [key, child] of children) {
        result[key] = child.get();
      }
      return result as T;
    }),
    distinctUntilChanged((a, b) => {
      if (a === null || a === undefined) return a === b;
      if (b === null || b === undefined) return false;
      return JSON.stringify(a) === JSON.stringify(b);
    }),
    map(deepFreeze),
    shareReplay(1)
  );
  $.subscribe(); // Keep hot
  
  // Create a stable reference object that we can update
  const nodeState: { children: Map<string, NodeCore<unknown>> | null } = { children };
  
  // Wrapper to update the children reference
  const updateChildrenRef = () => {
    nodeState.children = children;
  };
  
  // Override buildChildren to update the reference and connect pending children
  const buildChildrenAndUpdate = (obj: object) => {
    const keys = Object.keys(obj);
    children = new Map();
    
    for (const key of keys) {
      // Pass maybeNullable: true so nested nulls also become nullable nodes
      children.set(key, createNodeForValue((obj as Record<string, unknown>)[key], true));
    }
    updateChildrenRef();
    
    // Connect pending children to their real counterparts
    for (const [key, pendingNode] of pendingChildren) {
      if (children.has(key) && '_subscribeToRealChild' in pendingNode) {
        (pendingNode as { _subscribeToRealChild: () => void })._subscribeToRealChild();
      }
    }
  };
  
  // Re-initialize if starting with object (using updated builder)
  if (initialValue !== null && initialValue !== undefined && typeof initialValue === "object") {
    children = null; // Reset
    buildChildrenAndUpdate(initialValue);
  }
  
  return {
    [NULLABLE_NODE]: true as const,
    $,
    get children() { return nodeState.children; },
    
    get: () => deepFreeze(getCurrentValue()),
    
    set: (value: T) => {
      if (value === null || value === undefined) {
        // Setting to null - keep children structure for potential reuse but emit null
        subject$.next(value);
      } else if (typeof value === "object") {
        // Setting to object
        if (!children) {
          // First time setting an object - create children
          buildChildrenAndUpdate(value);
        } else {
          // Update existing children + handle new/removed keys
          const newKeys = new Set(Object.keys(value));
          const existingKeys = new Set(children.keys());
          
          // Update existing children
          for (const [key, child] of children) {
            if (newKeys.has(key)) {
              child.set((value as Record<string, unknown>)[key]);
            }
          }
          
          // Add new keys
          for (const key of newKeys) {
            if (!existingKeys.has(key)) {
              children.set(key, createNodeForValue((value as Record<string, unknown>)[key], true));
            }
          }
          
          // Note: We don't remove keys that are no longer present
          // This maintains reactivity for subscribers to those keys
        }
        subject$.next(value);
      } else {
        // Setting to a primitive value (string, number, boolean, etc.)
        // This handles cases like `string | null` where null was the initial value
        subject$.next(value);
      }
    },
    
    getChild: (key: string) => {
      // Return undefined if null or no children
      const value = subject$.getValue();
      if (value === null || value === undefined || !children) {
        return undefined;
      }
      return children.get(key);
    },
    
    getOrCreateChild: (key: string): NodeCore<unknown> => {
      // If we have real children and the key exists, return the real child
      if (children && children.has(key)) {
        return children.get(key)!;
      }
      
      // Check pendingChildren for already-created pending nodes
      if (pendingChildren.has(key)) {
        // Even though we have a pending node, if children now exist, return the real child
        // This handles the case where parent was set after pending node was created
        if (children && children.has(key)) {
          return children.get(key)!;
        }
        return pendingChildren.get(key)!;
      }
      
      // Create a "pending" child node that derives its value dynamically
      // When parent is null: emits undefined
      // When parent has value and real children exist: delegates to real child's observable
      // When parent has value but real children don't exist yet: extracts from parent value
      
      // We use a BehaviorSubject that we manually keep in sync
      const pendingSubject$ = new BehaviorSubject<unknown>(undefined);
      
      // Subscribe to parent changes to update pending subject
      const parentSubscription = subject$.subscribe((parentValue) => {
        if (parentValue === null || parentValue === undefined) {
          pendingSubject$.next(undefined);
        } else if (children && children.has(key)) {
          // Real child exists - get its current value
          pendingSubject$.next(children.get(key)!.get());
        } else {
          // Extract from parent value
          pendingSubject$.next((parentValue as Record<string, unknown>)[key]);
        }
      });
      
      // Also, we need to subscribe to real child changes when it exists
      // We'll do this by tracking when children are created and subscribing
      let realChildSubscription: Subscription | null = null;
      
      const child$ = pendingSubject$.pipe(
        distinctUntilChanged(),
        shareReplay(1)
      );
      child$.subscribe(); // Keep hot
      
      const pendingNode: NodeCore<unknown> & { _subscribeToRealChild: () => void } = {
        $: child$,
        get: () => {
          const parentValue = subject$.getValue();
          if (parentValue === null || parentValue === undefined) {
            return undefined;
          }
          // If real children exist now, delegate to them
          if (children && children.has(key)) {
            return children.get(key)!.get();
          }
          return (parentValue as Record<string, unknown>)[key];
        },
        set: (value: unknown) => {
          const parentValue = subject$.getValue();
          if (parentValue === null || parentValue === undefined) {
            // Can't set on null parent - this is a no-op
            return;
          }
          // If real children exist, delegate to them
          if (children && children.has(key)) {
            children.get(key)!.set(value);
            return;
          }
          // Otherwise update the parent directly
          const newParent = { ...(parentValue as object), [key]: value };
          subject$.next(newParent as T);
        },
        _subscribeToRealChild: () => {
          // Called when real children are created to subscribe to child changes
          if (children && children.has(key) && !realChildSubscription) {
            realChildSubscription = children.get(key)!.$.subscribe((value) => {
              pendingSubject$.next(value);
            });
          }
        },
      };
      
      pendingChildren.set(key, pendingNode);
      return pendingNode;
    },
    
    isNull: () => {
      const value = subject$.getValue();
      return value === null || value === undefined;
    },
    
    lock: () => lock$.next(false),
    unlock: () => lock$.next(true),
    
    subscribeOnce: (callback: (value: T) => void): Subscription => {
      return $.pipe(take(1)).subscribe(callback);
    },
  };
}

// Type guard for nullable nodes
function isNullableNode<T>(node: NodeCore<T>): node is NullableNodeCore<T> {
  return NULLABLE_NODE in node;
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
// When maybeNullable is true and value is null/undefined, creates a NullableNodeCore
// that can later be upgraded to an object with children
function createNodeForValue<T>(value: T, maybeNullable: boolean = false): NodeCore<T> {
  // Check for nullable marker (from nullable() helper)
  if (isNullableMarked(value)) {
    // Remove the marker before creating the node
    delete (value as Record<symbol, unknown>)[NULLABLE_MARKER];
    return createNullableObjectNode(value) as NodeCore<T>;
  }
  
  if (value === null || value === undefined) {
    if (maybeNullable) {
      // Create nullable node that can be upgraded to object later
      return createNullableObjectNode(value) as NodeCore<T>;
    }
    return createLeafNode(value as Primitive) as NodeCore<T>;
  }
  if (typeof value !== "object") {
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

/**
 * Wraps a nullable object node with a proxy that:
 * - Returns undefined for child property access when value is null
 * - Creates/returns wrapped children when value is non-null
 * - Provides update() for batched updates
 */
function wrapNullableWithProxy<T>(node: NullableNodeCore<T>, path: string = '', debugLog?: DebugLogFn): RxNullable<T> {
  // Create a wrapped set function that logs
  const wrappedSet = (v: T) => {
    const oldValue = node.get();
    debugLog?.(path || 'root', 'set', oldValue, v);
    node.set(v);
  };

  // Create update function
  const update = (callback: (draft: object) => void): T => {
    node.lock();
    try {
      // Build a proxy for the children
      const childrenProxy = new Proxy({} as object, {
        get(_, prop: PropertyKey) {
          if (typeof prop === "string") {
            const child = node.getChild(prop);
            if (child) {
              const childPath = path ? `${path}.${prop}` : prop;
              return wrapWithProxy(child, childPath, debugLog);
            }
          }
          return undefined;
        },
      });
      callback(childrenProxy);
    } finally {
      node.unlock();
    }
    return node.get();
  };

  const proxy = new Proxy(node.$ as object, {
    get(target, prop: PropertyKey) {
      // Observable methods
      if (prop === "subscribe") return node.$.subscribe.bind(node.$);
      if (prop === "pipe") return node.$.pipe.bind(node.$);
      if (prop === "forEach") return (node.$ as any).forEach?.bind(node.$);

      // Node methods
      if (prop === "get") return node.get;
      if (prop === "set") return wrappedSet;
      if (prop === "update") return update;
      if (prop === "subscribeOnce") return node.subscribeOnce;
      if (prop === NODE) return node;

      // Symbol.observable for RxJS interop
      if (prop === Symbol.observable || prop === "@@observable") {
        return () => node.$;
      }

      // Child property access - uses getOrCreateChild for deep subscription support
      // This means store.user.age.subscribe() works even when user is null
      if (typeof prop === "string") {
        const child = node.getOrCreateChild(prop);
        const childPath = path ? `${path}.${prop}` : prop;
        return wrapWithProxy(child, childPath, debugLog);
      }

      // Fallback to observable properties
      if (prop in target) {
        const val = (target as Record<PropertyKey, unknown>)[prop];
        return typeof val === "function" ? val.bind(target) : val;
      }

      return undefined;
    },

    has(_, prop) {
      // When value is non-null and we have children, check if prop exists
      if (!node.isNull() && node.children && typeof prop === "string") {
        return node.children.has(prop);
      }
      return false;
    },

    ownKeys() {
      if (!node.isNull() && node.children) {
        return Array.from(node.children.keys());
      }
      return [];
    },

    getOwnPropertyDescriptor(_, prop) {
      if (!node.isNull() && node.children && typeof prop === "string" && node.children.has(prop)) {
        return { enumerable: true, configurable: true };
      }
      return undefined;
    },
  });

  return proxy as unknown as RxNullable<T>;
}

function wrapWithProxy<T>(node: NodeCore<T>, path: string = '', debugLog?: DebugLogFn): RxNodeFor<T> {
  // Check for nullable node first (before checking value, since value might be null)
  if (isNullableNode(node)) {
    return wrapNullableWithProxy(node, path, debugLog) as RxNodeFor<T>;
  }

  const value = node.get();
  
  // Create a wrapped set function that logs
  const wrappedSet = (v: T) => {
    const oldValue = node.get();
    debugLog?.(path || 'root', 'set', oldValue, v);
    node.set(v);
  };

  // Primitive - just attach methods to observable
  if (value === null || typeof value !== "object") {
    return Object.assign(node.$, {
      get: node.get,
      set: wrappedSet,
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
      set: wrappedSet,
      subscribe: node.$.subscribe.bind(node.$),
      pipe: node.$.pipe.bind(node.$),
      subscribeOnce: node.subscribeOnce,
      at: (index: number) => {
        const child = arrayNode.at(index);
        if (!child) return undefined;
        const childPath = path ? `${path}[${index}]` : `[${index}]`;
        return wrapWithProxy(child, childPath, debugLog);
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
      if (prop === "set") return wrappedSet;
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
          const childPath = path ? `${path}.${prop}` : prop;
          return wrapWithProxy(child, childPath, debugLog);
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

export interface StateOptions {
  /** Enable debug logging for this store */
  debug?: boolean;
  /** Optional name for this store (used in debug logs) */
  name?: string;
}

export function state<T extends object>(initialState: T, options?: StateOptions): RxState<T> {
  // Create debug log function if debug is enabled
  const debugLog = options?.debug 
    ? createDebugLog({ enabled: true, storeName: options.name })
    : undefined;
  
  const node = createObjectNode(initialState);
  return wrapWithProxy(node as NodeCore<T>, '', debugLog) as RxState<T>;
}

// Symbol to mark a value as nullable
const NULLABLE_MARKER = Symbol("nullable");


/**
 * Marks a value as nullable, allowing it to transition between null and object.
 * Use this when you want to start with an object value but later set it to null.
 * 
 * @example
 * const store = state({
 *   // Can start with object and later be set to null
 *   user: nullable({ name: "Alice", age: 30 }),
 *   // Can start with null and later be set to object  
 *   profile: nullable<{ bio: string }>(null),
 * });
 * 
 * // Use ?. on the nullable property, then access children directly
 * store.user?.set(null);  // Works!
 * store.user?.set({ name: "Bob", age: 25 });  // Works!
 * store.user?.name.set("Charlie");  // After ?. on user, children are directly accessible
 */
export function nullable<T extends object>(value: T | null): T | null {
  if (value === null) {
    return null;
  }
  // Mark the object so createNodeForValue knows to use NullableNodeCore
  return Object.assign(value, { [NULLABLE_MARKER]: true }) as T | null;
}

// Check if a value was marked as nullable
function isNullableMarked<T>(value: T): boolean {
  return value !== null && typeof value === "object" && NULLABLE_MARKER in value;
}
