/**
 * Convenience helpers for deepstate.
 * 
 * These are optional utilities that build on top of the core state() function.
 * They can be imported from 'deepstate' or 'deepstate/helpers'.
 */

import { Observable, combineLatest } from "rxjs";
import { distinctUntilChanged, map } from "rxjs/operators";

// Deep equality check with circular reference protection
function deepEqual(a: unknown, b: unknown, seen = new WeakMap<object, WeakSet<object>>()): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;

  // Circular reference protection: if we've already compared these two objects, return true
  // (they're equal as far as we've seen, and going deeper would be infinite)
  const seenWithA = seen.get(a as object);
  if (seenWithA?.has(b as object)) return true;
  
  // Track this comparison
  if (!seen.has(a as object)) {
    seen.set(a as object, new WeakSet());
  }
  seen.get(a as object)!.add(b as object);

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i], seen));
  }

  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  return keysA.every((key) =>
    deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], seen)
  );
}

// Helper to check if something is an Observable
function isObservable(obj: unknown): obj is Observable<unknown> {
  return (
    obj !== null &&
    typeof obj === "object" &&
    "subscribe" in obj &&
    typeof (obj as Record<string, unknown>).subscribe === "function"
  );
}

// Helper type to extract the value type from an Observable
type ObservableValue<T> = T extends Observable<infer U> ? U : never;

// Type for array of observables -> tuple of their values
type ObservableValues<T extends Observable<unknown>[]> = {
  [K in keyof T]: ObservableValue<T[K]>;
};

// Type for object of observables -> object of their values
type ObservableObjectValues<T extends Record<string, Observable<unknown>>> = {
  [K in keyof T]: ObservableValue<T[K]>;
};

/**
 * Select multiple observables and combine them into a single observable.
 *
 * @example Array form - returns tuple
 * ```ts
 * select(myState.user.name, myState.user.profile.address.city)
 *   .subscribe(([name, city]) => console.log(name, city));
 * ```
 *
 * @example Object form - returns object with named keys
 * ```ts
 * select({
 *   name: myState.user.name,
 *   city: myState.user.profile.address.city,
 * }).subscribe(({ name, city }) => console.log(name, city));
 * ```
 */
export function select<T extends Observable<unknown>[]>(
  ...observables: T
): Observable<ObservableValues<T>>;
export function select<T extends Record<string, Observable<unknown>>>(
  observables: T
): Observable<ObservableObjectValues<T>>;
export function select(
  ...args: Observable<unknown>[] | [Record<string, Observable<unknown>>]
): Observable<unknown> {
  // Object form: select({ name: obs1, city: obs2 })
  if (args.length === 1 && !isObservable(args[0])) {
    const obj = args[0] as Record<string, Observable<unknown>>;
    const keys = Object.keys(obj);
    const observables = keys.map((k) => obj[k]);

    return combineLatest(observables).pipe(
      map((values) => {
        const result: Record<string, unknown> = {};
        keys.forEach((key, i) => {
          result[key] = values[i];
        });
        return result;
      })
    );
  }

  // Array form: select(obs1, obs2, obs3)
  return combineLatest(args as Observable<unknown>[]);
}

/**
 * Select a derived value from each item in an array, with precise change detection.
 * Only emits when the selected/derived values actually change, not when other
 * properties of the array items change.
 *
 * @example Select a single property from each item
 * ```ts
 * selectFromEach(myState.items, item => item.price)
 *   .subscribe(prices => {
 *     const total = prices.reduce((a, b) => a + b, 0);
 *   });
 * ```
 *
 * @example Select multiple properties / derived values
 * ```ts
 * selectFromEach(myState.items, item => ({
 *   name: item.name,
 *   total: item.price * item.qty
 * })).subscribe(summaries => console.log(summaries));
 * ```
 *
 * @param arrayNode - An RxArray node from your state (e.g., `myState.items`)
 * @param selector - A function that extracts/derives a value from each item
 * @returns An Observable that emits an array of selected values
 */
export function selectFromEach<T, U>(
  arrayNode: Observable<ReadonlyArray<T>>,
  selector: (item: T, index: number) => U
): Observable<U[]> {
  return arrayNode.pipe(
    map((items) => items.map(selector)),
    distinctUntilChanged((a, b) =>
      a.length === b.length && a.every((v, i) => deepEqual(v, b[i]))
    )
  );
}
