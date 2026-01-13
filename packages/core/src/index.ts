/**
 * deepstate - Proxy-based RxJS state management
 * 
 * Core exports:
 * - state() - Create reactive state from plain objects
 * - nullable() - Mark a property as nullable (can transition between null and object)
 * - array() - Mark an array with deduplication options
 * - RxState, Draft - Type exports
 * 
 * Helper exports:
 * - select() - Combine multiple observables
 * - selectFromEach() - Select from each array item with precise change detection
 */

export { state, nullable, array, type RxState, type Draft, type StateOptions, type ArrayOptions, type ArrayDistinct } from "./deepstate";
export { select, selectFromEach } from "./helpers";
