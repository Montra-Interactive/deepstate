/**
 * deepstate - Proxy-based RxJS state management
 * 
 * Core exports:
 * - state() - Create reactive state from plain objects
 * - RxState, Draft - Type exports
 * 
 * Helper exports:
 * - select() - Combine multiple observables
 * - selectFromEach() - Select from each array item with precise change detection
 */

// Core
export { state, type RxState, type Draft } from "./deepstate";

// Helpers (also importable from 'deepstate/helpers')
export { select, selectFromEach } from "./helpers";
