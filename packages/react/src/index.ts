/**
 * deepstate-react - React bindings for deepstate
 *
 * Provides hooks for using deepstate reactive state in React components.
 *
 * @example
 * ```tsx
 * import { state } from 'deepstate';
 * import { useStateValue, useSelector } from 'deepstate-react';
 *
 * const store = state({ user: { name: 'Alice', age: 30 }, count: 0 });
 *
 * function UserName() {
 *   const name = useStateValue(store.user.name);
 *   return <span>{name}</span>;
 * }
 *
 * function UserSummary() {
 *   const summary = useSelector(store.user, user => `${user.name} (${user.age})`);
 *   return <span>{summary}</span>;
 * }
 * ```
 */

export {
  useStateValue,
  useSelector,
  useObservable,
} from "./hooks.js";

export type { Observable } from "rxjs";
