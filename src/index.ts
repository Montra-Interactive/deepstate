/**
 * deepstate - Proxy-based RxJS state management
 * 
 * Core exports (V2 - nested BehaviorSubjects, O(depth) performance):
 * - state() - Create reactive state from plain objects
 * - RxState, Draft - Type exports
 * 
 * V1 exports (single BehaviorSubject, O(subscribers) performance):
 * - stateV1() - Original implementation
 * - RxStateV1, DraftV1 - Type exports
 * 
 * Helper exports:
 * - select() - Combine multiple observables
 * - selectFromEach() - Select from each array item with precise change detection
 */

// V2 as default (nested BehaviorSubjects - O(depth) per change)
export { state, type RxState, type Draft } from "./deepstate-v2";

// V1 available as alternate (single BehaviorSubject - O(subscribers) per change)
export { 
  state as stateV1, 
  type RxState as RxStateV1, 
  type Draft as DraftV1 
} from "./deepstate";

// Helpers (work with both V1 and V2)
export { select, selectFromEach } from "./helpers";
