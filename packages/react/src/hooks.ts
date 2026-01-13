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
  return (
    obj !== null &&
    typeof obj === "object" &&
    "subscribe" in obj &&
    typeof (obj as Record<string, unknown>).subscribe === "function"
  );
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
 * Hook to get the current value of a deepstate node.
 * Re-renders the component whenever the node's value changes.
 *
 * This is the primary hook for using deepstate in React.
 * Works with any deepstate node: RxLeaf, RxObject, RxArray, or RxNullable.
 *
 * Uses React 18's useSyncExternalStore for concurrent-mode safety.
 *
 * @param node - A deepstate node (any reactive property from your state)
 * @returns The current value of the node (deeply readonly)
 *
 * @example
 * ```tsx
 * import { state } from 'deepstate';
 * import { useStateValue } from 'deepstate-react';
 *
 * const store = state({
 *   user: { name: 'Alice', age: 30 },
 *   items: [{ id: 1, name: 'Item 1' }],
 *   count: 0
 * });
 *
 * // Subscribe to a primitive
 * function Counter() {
 *   const count = useStateValue(store.count);
 *   return <span>{count}</span>;
 * }
 *
 * // Subscribe to an object
 * function UserCard() {
 *   const user = useStateValue(store.user);
 *   return <div>{user.name}, {user.age}</div>;
 * }
 *
 * // Subscribe to a nested property (fine-grained!)
 * function UserName() {
 *   const name = useStateValue(store.user.name);
 *   return <span>{name}</span>;
 * }
 *
 * // Subscribe to an array
 * function ItemList() {
 *   const items = useStateValue(store.items);
 *   return <ul>{items.map(item => <li key={item.id}>{item.name}</li>)}</ul>;
 * }
 * ```
 */
export function useStateValue<T extends Observable<unknown>>(
  node: T
): ObservableValue<T> {
  // Ref to hold the current value - updated by subscription
  const valueRef = useRef<ObservableValue<T>>(
    hasGet<ObservableValue<T>>(node) ? node.get() : (undefined as ObservableValue<T>)
  );

  // Subscribe callback for useSyncExternalStore
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const subscription = node.subscribe((newValue) => {
        valueRef.current = newValue as ObservableValue<T>;
        onStoreChange();
      });

      return () => subscription.unsubscribe();
    },
    [node]
  );

  // Get snapshot - just returns the ref value
  const getSnapshot = useCallback(() => valueRef.current, []);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Hook to derive a value from one or more deepstate nodes with a selector function.
 * Only re-renders when the derived value changes (using reference equality by default).
 *
 * Use this when you need to compute/transform a value from state.
 * The selector runs on every emission but only triggers re-render if result changes.
 *
 * Uses React 18's useSyncExternalStore for concurrent-mode safety.
 *
 * @param node - A deepstate node, array of nodes, or object of nodes to select from
 * @param selector - Function to derive a value from the node's value(s)
 * @param equalityFn - Optional custom equality function (default: Object.is)
 * @returns The derived value
 *
 * @example Single node
 * ```tsx
 * import { state } from 'deepstate';
 * import { useSelector } from 'deepstate-react';
 *
 * const store = state({
 *   user: { firstName: 'Alice', lastName: 'Smith', age: 30 },
 *   items: [{ id: 1, price: 10 }, { id: 2, price: 20 }]
 * });
 *
 * // Derive a computed value from a single node
 * function FullName() {
 *   const fullName = useSelector(
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
 *   const percentage = useSelector(
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
 *   const percentage = useSelector(
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
 *   const ids = useSelector(
 *     store.items,
 *     items => items.map(i => i.id),
 *     (a, b) => a.length === b.length && a.every((v, i) => v === b[i])
 *   );
 *   return <span>{ids.join(', ')}</span>;
 * }
 * ```
 */
// Single node overload
export function useSelector<T extends Observable<unknown>, R>(
  node: T,
  selector: (value: ObservableValue<T>) => R,
  equalityFn?: (a: R, b: R) => boolean
): R;
// Array of nodes overload
export function useSelector<
  T1 extends Observable<unknown>,
  T2 extends Observable<unknown>,
  R
>(
  nodes: [T1, T2],
  selector: (values: [ObservableValue<T1>, ObservableValue<T2>]) => R,
  equalityFn?: (a: R, b: R) => boolean
): R;
export function useSelector<
  T1 extends Observable<unknown>,
  T2 extends Observable<unknown>,
  T3 extends Observable<unknown>,
  R
>(
  nodes: [T1, T2, T3],
  selector: (values: [ObservableValue<T1>, ObservableValue<T2>, ObservableValue<T3>]) => R,
  equalityFn?: (a: R, b: R) => boolean
): R;
export function useSelector<
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
export function useSelector<
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
// Object of nodes overload
export function useSelector<T extends Record<string, Observable<unknown>>, R>(
  nodes: T,
  selector: (values: ObservableObjectValues<T>) => R,
  equalityFn?: (a: R, b: R) => boolean
): R;
// Implementation
export function useSelector(
  nodeOrNodes: Observable<unknown> | Observable<unknown>[] | Record<string, Observable<unknown>>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selector: (value: any) => any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  equalityFn: (a: any, b: any) => boolean = Object.is
): unknown {
  // Determine the form and create the combined observable
  const { combined$, getInitialValue } = useMemo(() => {
    // Array form: [node1, node2, ...]
    if (Array.isArray(nodeOrNodes)) {
      const nodes = nodeOrNodes as Observable<unknown>[];
      return {
        combined$: combineLatest(nodes).pipe(
          map((values) => selector(values)),
          distinctUntilChanged(equalityFn)
        ),
        getInitialValue: (): unknown => {
          const values = nodes.map((n) => (hasGet<unknown>(n) ? n.get() : undefined));
          return selector(values);
        },
      };
    }

    // Object form: { a: node1, b: node2, ... }
    if (!isObservable(nodeOrNodes)) {
      const obj = nodeOrNodes as Record<string, Observable<unknown>>;
      const keys = Object.keys(obj);
      const observables = keys.map((k) => obj[k]);

      return {
        combined$: combineLatest(observables).pipe(
          map((values) => {
            const result: Record<string, unknown> = {};
            keys.forEach((key, i) => {
              result[key] = values[i];
            });
            return selector(result);
          }),
          distinctUntilChanged(equalityFn)
        ),
        getInitialValue: (): unknown => {
          const result: Record<string, unknown> = {};
          keys.forEach((key) => {
            const node = obj[key];
            result[key] = hasGet<unknown>(node) ? node.get() : undefined;
          });
          return selector(result);
        },
      };
    }

    // Single node form
    const node = nodeOrNodes as Observable<unknown>;
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
