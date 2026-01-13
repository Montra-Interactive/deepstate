import { useSyncExternalStore, useMemo, useCallback, useRef } from "react";
import type { Observable } from "rxjs";
import { combineLatest } from "rxjs";
import { map, distinctUntilChanged } from "rxjs/operators";

/**
 * Type helper to extract the value type from an Observable.
 * Works with deepstate nodes since they extend Observable.
 */
type ObservableValue<T> = T extends Observable<infer V> ? V : never;

/**
 * Type for array of observables -> tuple of their values
 */
type ObservableValues<T extends readonly Observable<unknown>[]> = {
  [K in keyof T]: ObservableValue<T[K]>;
};

/**
 * Type for object of observables -> object of their values
 */
type ObservableObjectValues<T extends Record<string, Observable<unknown>>> = {
  [K in keyof T]: ObservableValue<T[K]>;
};

/**
 * Interface for deepstate nodes that have a synchronous get() method.
 * This is used internally to detect deepstate nodes vs plain observables.
 */
interface NodeWithGet<T> {
  get(): T;
}

function hasGet<T>(obj: unknown): obj is NodeWithGet<T> {
  return obj !== null && typeof obj === "object" && "get" in obj && typeof (obj as NodeWithGet<T>).get === "function";
}

function isObservable(obj: unknown): obj is Observable<unknown> {
  if (obj === null || typeof obj !== "object") return false;
  // Check by accessing subscribe directly - works with proxied observables
  // where "in" operator may not work correctly
  try {
    return typeof (obj as Record<string, unknown>).subscribe === "function";
  } catch {
    return false;
  }
}

/**
 * Hook to subscribe to any Observable and get its current value.
 * Re-renders the component whenever the observable emits a new value.
 *
 * Works with any RxJS Observable, including deepstate nodes.
 *
 * @param observable$ - Any RxJS Observable
 * @param getSnapshot - Function to get the current value (required for plain observables)
 * @returns The current value of the observable
 *
 * @example
 * ```tsx
 * import { useObservable } from 'deepstate-react';
 * import { BehaviorSubject } from 'rxjs';
 *
 * const count$ = new BehaviorSubject(0);
 *
 * function Counter() {
 *   const count = useObservable(count$, () => count$.getValue());
 *   return <span>{count}</span>;
 * }
 * ```
 */
export function useObservable<T>(
  observable$: Observable<T>,
  getSnapshot: () => T
): T {
  const valueRef = useRef<T>(getSnapshot());

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const subscription = observable$.subscribe((newValue) => {
        valueRef.current = newValue;
        onStoreChange();
      });

      return () => subscription.unsubscribe();
    },
    [observable$]
  );

  const getSnapshotMemo = useCallback(() => valueRef.current, []);

  return useSyncExternalStore(subscribe, getSnapshotMemo, getSnapshotMemo);
}

/**
 * Hook to get values from one or more deepstate nodes, optionally with a selector function.
 * Re-renders the component whenever the selected value changes.
 *
 * This is the primary hook for using deepstate in React.
 * Uses React 18's useSyncExternalStore for concurrent-mode safety.
 *
 * @example Single node (get raw value)
 * ```tsx
 * import { state } from 'deepstate';
 * import { useSelect } from 'deepstate-react';
 *
 * const store = state({
 *   user: { name: 'Alice', age: 30 },
 *   count: 0
 * });
 *
 * // Subscribe to a primitive
 * function Counter() {
 *   const count = useSelect(store.count);
 *   return <span>{count}</span>;
 * }
 *
 * // Subscribe to an object
 * function UserCard() {
 *   const user = useSelect(store.user);
 *   return <div>{user.name}, {user.age}</div>;
 * }
 *
 * // Subscribe to a nested property (fine-grained!)
 * function UserName() {
 *   const name = useSelect(store.user.name);
 *   return <span>{name}</span>;
 * }
 * ```
 *
 * @example Single node with selector (derive a value)
 * ```tsx
 * // Derive a computed value from a single node
 * function FullName() {
 *   const fullName = useSelect(
 *     store.user,
 *     user => `${user.firstName} ${user.lastName}`
 *   );
 *   return <span>{fullName}</span>;
 * }
 * ```
 *
 * @example Multiple nodes (array form)
 * ```tsx
 * // Combine multiple nodes - receives values as tuple
 * function Progress() {
 *   const percentage = useSelect(
 *     [store.completed, store.total],
 *     ([completed, total]) => total > 0 ? (completed / total) * 100 : 0
 *   );
 *   return <span>{percentage}%</span>;
 * }
 * ```
 *
 * @example Multiple nodes (object form)
 * ```tsx
 * // Combine multiple nodes - receives values as object
 * function Progress() {
 *   const percentage = useSelect(
 *     { completed: store.completed, total: store.total },
 *     ({ completed, total }) => total > 0 ? (completed / total) * 100 : 0
 *   );
 *   return <span>{percentage}%</span>;
 * }
 * ```
 *
 * @example With custom equality
 * ```tsx
 * function ItemIds() {
 *   const ids = useSelect(
 *     store.items,
 *     items => items.map(i => i.id),
 *     (a, b) => a.length === b.length && a.every((v, i) => v === b[i])
 *   );
 *   return <span>{ids.join(', ')}</span>;
 * }
 * ```
 */
// Single node, no selector - return raw value
export function useSelect<T extends Observable<unknown>>(
  node: T
): ObservableValue<T>;
// Single node with selector
export function useSelect<T extends Observable<unknown>, R>(
  node: T,
  selector: (value: ObservableValue<T>) => R,
  equalityFn?: (a: R, b: R) => boolean
): R;
// Array of 2 nodes with selector
export function useSelect<
  T1 extends Observable<unknown>,
  T2 extends Observable<unknown>,
  R
>(
  nodes: [T1, T2],
  selector: (values: [ObservableValue<T1>, ObservableValue<T2>]) => R,
  equalityFn?: (a: R, b: R) => boolean
): R;
// Array of 3 nodes with selector
export function useSelect<
  T1 extends Observable<unknown>,
  T2 extends Observable<unknown>,
  T3 extends Observable<unknown>,
  R
>(
  nodes: [T1, T2, T3],
  selector: (values: [ObservableValue<T1>, ObservableValue<T2>, ObservableValue<T3>]) => R,
  equalityFn?: (a: R, b: R) => boolean
): R;
// Array of 4 nodes with selector
export function useSelect<
  T1 extends Observable<unknown>,
  T2 extends Observable<unknown>,
  T3 extends Observable<unknown>,
  T4 extends Observable<unknown>,
  R
>(
  nodes: [T1, T2, T3, T4],
  selector: (values: [ObservableValue<T1>, ObservableValue<T2>, ObservableValue<T3>, ObservableValue<T4>]) => R,
  equalityFn?: (a: R, b: R) => boolean
): R;
// Array of 5 nodes with selector
export function useSelect<
  T1 extends Observable<unknown>,
  T2 extends Observable<unknown>,
  T3 extends Observable<unknown>,
  T4 extends Observable<unknown>,
  T5 extends Observable<unknown>,
  R
>(
  nodes: [T1, T2, T3, T4, T5],
  selector: (values: [ObservableValue<T1>, ObservableValue<T2>, ObservableValue<T3>, ObservableValue<T4>, ObservableValue<T5>]) => R,
  equalityFn?: (a: R, b: R) => boolean
): R;
// Object of nodes with selector
export function useSelect<T extends Record<string, Observable<unknown>>, R>(
  nodes: T,
  selector: (values: ObservableObjectValues<T>) => R,
  equalityFn?: (a: R, b: R) => boolean
): R;
// Implementation
export function useSelect(
  nodeOrNodes: Observable<unknown> | Observable<unknown>[] | Record<string, Observable<unknown>>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selector?: (value: any) => any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  equalityFn: (a: any, b: any) => boolean = Object.is
): unknown {
  // Determine the form and create the combined observable
  const { combined$, getInitialValue } = useMemo(() => {
    // Array form: [node1, node2, ...] - always requires selector
    if (Array.isArray(nodeOrNodes)) {
      const nodes = nodeOrNodes as Observable<unknown>[];
      const sel = selector!; // selector is required for array form
      return {
        combined$: combineLatest(nodes).pipe(
          map((values) => sel(values)),
          distinctUntilChanged(equalityFn)
        ),
        getInitialValue: (): unknown => {
          const values = nodes.map((n) => (hasGet<unknown>(n) ? n.get() : undefined));
          return sel(values);
        },
      };
    }

    // Object form: { a: node1, b: node2, ... } - always requires selector
    if (!isObservable(nodeOrNodes)) {
      const obj = nodeOrNodes as Record<string, Observable<unknown>>;
      const keys = Object.keys(obj);
      const observables = keys.map((k) => obj[k]);
      const sel = selector!; // selector is required for object form

      return {
        combined$: combineLatest(observables).pipe(
          map((values) => {
            const result: Record<string, unknown> = {};
            keys.forEach((key, i) => {
              result[key] = values[i];
            });
            return sel(result);
          }),
          distinctUntilChanged(equalityFn)
        ),
        getInitialValue: (): unknown => {
          const result: Record<string, unknown> = {};
          keys.forEach((key) => {
            const node = obj[key];
            result[key] = hasGet<unknown>(node) ? node.get() : undefined;
          });
          return sel(result);
        },
      };
    }

    // Single node form - selector is optional
    const node = nodeOrNodes as Observable<unknown>;
    
    if (selector) {
      // With selector - apply transformation
      return {
        combined$: node.pipe(
          map((value) => selector(value)),
          distinctUntilChanged(equalityFn)
        ),
        getInitialValue: (): unknown => {
          if (hasGet<unknown>(node)) {
            return selector(node.get());
          }
          return undefined;
        },
      };
    } else {
      // No selector - return raw value
      return {
        combined$: node.pipe(
          distinctUntilChanged(equalityFn)
        ),
        getInitialValue: (): unknown => {
          if (hasGet<unknown>(node)) {
            return node.get();
          }
          return undefined;
        },
      };
    }
  }, [nodeOrNodes, selector, equalityFn]);

  // Ref to hold the current derived value
  const valueRef = useRef<unknown>(getInitialValue());

  // Subscribe callback for useSyncExternalStore
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const subscription = combined$.subscribe((newValue) => {
        valueRef.current = newValue;
        onStoreChange();
      });

      return () => subscription.unsubscribe();
    },
    [combined$]
  );

  // Get snapshot - just returns the ref value
  const getSnapshot = useCallback(() => valueRef.current, []);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * @deprecated Use `useSelect` instead. This is an alias for backwards compatibility.
 */
export const useStateValue = useSelect;

/**
 * @deprecated Use `useSelect` instead. This is an alias for backwards compatibility.
 */
export const useSelector = useSelect;
