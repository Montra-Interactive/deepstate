import { useSyncExternalStore, useMemo, useCallback, useRef } from "react";
import type { Observable } from "rxjs";
import { map, distinctUntilChanged } from "rxjs/operators";

/**
 * Type helper to extract the value type from an Observable.
 * Works with deepstate nodes since they extend Observable.
 */
type ObservableValue<T> = T extends Observable<infer V> ? V : never;

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
 * Hook to derive a value from a deepstate node with a selector function.
 * Only re-renders when the derived value changes (using reference equality by default).
 *
 * Use this when you need to compute/transform a value from state.
 * The selector runs on every emission but only triggers re-render if result changes.
 *
 * Uses React 18's useSyncExternalStore for concurrent-mode safety.
 *
 * @param node - A deepstate node to select from
 * @param selector - Function to derive a value from the node's value
 * @param equalityFn - Optional custom equality function (default: Object.is)
 * @returns The derived value
 *
 * @example
 * ```tsx
 * import { state } from 'deepstate';
 * import { useSelector } from 'deepstate-react';
 *
 * const store = state({
 *   user: { firstName: 'Alice', lastName: 'Smith', age: 30 },
 *   items: [{ id: 1, price: 10 }, { id: 2, price: 20 }]
 * });
 *
 * // Derive a computed value
 * function FullName() {
 *   const fullName = useSelector(
 *     store.user,
 *     user => `${user.firstName} ${user.lastName}`
 *   );
 *   return <span>{fullName}</span>;
 * }
 *
 * // Derive from an array
 * function TotalPrice() {
 *   const total = useSelector(
 *     store.items,
 *     items => items.reduce((sum, item) => sum + item.price, 0)
 *   );
 *   return <span>Total: ${total}</span>;
 * }
 *
 * // With custom equality (e.g., for arrays)
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
export function useSelector<T extends Observable<unknown>, R>(
  node: T,
  selector: (value: ObservableValue<T>) => R,
  equalityFn: (a: R, b: R) => boolean = Object.is
): R {
  // Create derived observable that applies selector and dedupes
  const derived$ = useMemo(
    () =>
      node.pipe(
        map((value) => selector(value as ObservableValue<T>)),
        distinctUntilChanged(equalityFn)
      ),
    [node, selector, equalityFn]
  );

  // Get initial derived value
  const getInitialValue = (): R => {
    if (hasGet<ObservableValue<T>>(node)) {
      return selector(node.get());
    }
    return undefined as R;
  };

  // Ref to hold the current derived value
  const valueRef = useRef<R>(getInitialValue());

  // Subscribe callback for useSyncExternalStore
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const subscription = derived$.subscribe((newValue) => {
        valueRef.current = newValue;
        onStoreChange();
      });

      return () => subscription.unsubscribe();
    },
    [derived$]
  );

  // Get snapshot - just returns the ref value
  const getSnapshot = useCallback(() => valueRef.current, []);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
