/**
 * deepstate-react - React bindings for deepstate
 *
 * Provides hooks for using deepstate reactive state in React components.
 *
 * @example
 * ```tsx
 * import { state } from 'deepstate';
 * import { useSelect } from 'deepstate-react';
 *
 * const store = state({ user: { name: 'Alice', age: 30 }, count: 0 });
 *
 * // Get raw value
 * function UserName() {
 *   const name = useSelect(store.user.name);
 *   return <span>{name}</span>;
 * }
 *
 * // With selector
 * function UserSummary() {
 *   const summary = useSelect(store.user, user => `${user.name} (${user.age})`);
 *   return <span>{summary}</span>;
 * }
 *
 * // Combine multiple nodes
 * function Progress() {
 *   const pct = useSelect(
 *     [store.completed, store.total],
 *     ([completed, total]) => total > 0 ? (completed / total) * 100 : 0
 *   );
 *   return <span>{pct}%</span>;
 * }
 * ```
 */

export {
  useSelect,
  usePipeSelect,
  useObservable,
  // Deprecated aliases for backwards compatibility
  useStateValue,
  useSelector,
} from "./hooks";

export type { DeepstateNode } from "./hooks";

export type { Observable } from "rxjs";
