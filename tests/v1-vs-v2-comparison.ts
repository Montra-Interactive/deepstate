/**
 * Side-by-side comparison of v1 vs v2 emission behavior
 * 
 * The key difference: when one property changes, how many
 * equality comparisons are performed internally?
 */

import { state as stateV1, deepEqualCallCount, resetDeepEqualCallCount } from '../src/deepstate';
import { state as stateV2, distinctCallCount, resetDistinctCallCount } from '../src/deepstate-v2';

console.log('=== v1 vs v2 Internal Work Comparison ===\n');

// Create identical state structure
const createInitialState = () => ({
  user: { name: 'Alice', age: 30 },
  settings: { theme: 'dark', lang: 'en' },
  items: [
    { id: 1, name: 'A', price: 10 },
    { id: 2, name: 'B', price: 20 },
  ],
});

// =============================================================================
// Test: Change user.name, count emissions on ALL subscribers
// =============================================================================

console.log('--- Test: Change user.name, count all emissions ---\n');

// V1
const storeV1 = stateV1(createInitialState());
let v1Emissions = {
  userName: 0,
  userAge: 0,
  settingsTheme: 0,
  settingsLang: 0,
};

storeV1.user.name.subscribe(() => v1Emissions.userName++);
storeV1.user.age.subscribe(() => v1Emissions.userAge++);
storeV1.settings.theme.subscribe(() => v1Emissions.settingsTheme++);
storeV1.settings.lang.subscribe(() => v1Emissions.settingsLang++);

// Reset counts after initial emission
v1Emissions = { userName: 0, userAge: 0, settingsTheme: 0, settingsLang: 0 };
resetDeepEqualCallCount();

// Change user.name
storeV1.user.name.set('Bob');

console.log('V1 (single BehaviorSubject) after changing user.name:');
console.log(`  user.name: ${v1Emissions.userName}, user.age: ${v1Emissions.userAge}, settings.theme: ${v1Emissions.settingsTheme}, settings.lang: ${v1Emissions.settingsLang}`);
console.log(`  Total subscriber callbacks: ${Object.values(v1Emissions).reduce((a, b) => a + b, 0)}`);
console.log(`  deepEqual() calls: ${deepEqualCallCount}`);

// V2
const storeV2 = stateV2(createInitialState());
let v2Emissions = {
  userName: 0,
  userAge: 0,
  settingsTheme: 0,
  settingsLang: 0,
};

storeV2.user.name.subscribe(() => v2Emissions.userName++);
storeV2.user.age.subscribe(() => v2Emissions.userAge++);
storeV2.settings.theme.subscribe(() => v2Emissions.settingsTheme++);
storeV2.settings.lang.subscribe(() => v2Emissions.settingsLang++);

// Reset after initial emissions
v2Emissions = { userName: 0, userAge: 0, settingsTheme: 0, settingsLang: 0 };
resetDistinctCallCount();

// Change user.name
storeV2.user.name.set('Bob');

console.log('\nV2 (nested BehaviorSubjects) after changing user.name:');
console.log(`  user.name: ${v2Emissions.userName}, user.age: ${v2Emissions.userAge}, settings.theme: ${v2Emissions.settingsTheme}, settings.lang: ${v2Emissions.settingsLang}`);
console.log(`  Total subscriber callbacks: ${Object.values(v2Emissions).reduce((a, b) => a + b, 0)}`);
console.log(`  distinctUntilChanged() comparisons: ${distinctCallCount}`);

console.log('\n---');
console.log('V1: ALL subscribers are notified, then filtered by distinctUntilChanged');
console.log('V2: ONLY affected paths are notified (user.name + ancestors)');
console.log('');

// =============================================================================
// Simulate larger scale: 100 subscribers to different paths
// =============================================================================

console.log('--- Simulated scale: 100 subscribers, 1 change ---\n');

// For V1, all 100 would run their filter logic
// For V2, only the affected path runs

const manyPropsState = () => {
  const obj: Record<string, { value: number }> = {};
  for (let i = 0; i < 100; i++) {
    obj[`prop${i}`] = { value: i };
  }
  return obj;
};

const largeV1 = stateV1(manyPropsState());
const largeV2 = stateV2(manyPropsState());

let largeV1Emissions = 0;
let largeV2Emissions = 0;

// Subscribe to all 100 properties
for (let i = 0; i < 100; i++) {
  (largeV1 as any)[`prop${i}`].value.subscribe(() => largeV1Emissions++);
  (largeV2 as any)[`prop${i}`].value.subscribe(() => largeV2Emissions++);
}

// Reset after initial
largeV1Emissions = 0;
largeV2Emissions = 0;
resetDeepEqualCallCount();
resetDistinctCallCount();

// Change just prop0.value
(largeV1 as any).prop0.value.set(999);
const v1DeepEqualCalls = deepEqualCallCount;

resetDeepEqualCallCount();
(largeV2 as any).prop0.value.set(999);
const v2DistinctCalls = distinctCallCount;

console.log('After changing prop0.value with 100 subscribers:');
console.log(`  V1 total emissions: ${largeV1Emissions}`);
console.log(`  V2 total emissions: ${largeV2Emissions}`);
console.log('');
console.log(`  V1 deepEqual() calls: ${v1DeepEqualCalls}`);
console.log(`  V2 distinctUntilChanged() comparisons: ${v2DistinctCalls}`);
console.log('');

if (v1DeepEqualCalls > v2DistinctCalls) {
  console.log(`  V2 does ${v1DeepEqualCalls - v2DistinctCalls} FEWER comparisons! (${((v1DeepEqualCalls - v2DistinctCalls) / v1DeepEqualCalls * 100).toFixed(1)}% reduction)`);
} else if (v1DeepEqualCalls === v2DistinctCalls) {
  console.log('  Same number of comparisons');
} else {
  console.log(`  V1 does fewer comparisons (unexpected)`);
}

// =============================================================================
// The REAL difference: internal work per change
// =============================================================================

console.log('\n--- The REAL difference: internal operations ---\n');

console.log('deepstate V1 architecture:');
console.log('  - Single BehaviorSubject at root');
console.log('  - EVERY subscriber has a pipe: root$.pipe(map(getAtPath), distinctUntilChanged(deepEqual))');
console.log('  - When root changes, ALL 100 pipes run:');
console.log('    - 100x map(getAtPath) calls');
console.log('    - 100x deepEqual comparisons');
console.log('  - Only THEN does distinctUntilChanged filter to 1 emission');
console.log('  - Complexity: O(subscribers) per change');
console.log('');
console.log('deepstate V2 architecture:');
console.log('  - BehaviorSubject per leaf, combineLatest for parents');
console.log('  - When prop0.value changes:');
console.log('    - prop0.value$ emits (1 subscriber notified)');
console.log('    - prop0$ combineLatest emits (parent notified)');
console.log('    - root$ combineLatest emits (grandparent notified)');
console.log('    - prop1-99 are NOT in the notification chain at all');
console.log('  - No filtering needed - siblings never see the event');
console.log('  - Complexity: O(depth) per change');
console.log('');
console.log('deep-state-observer (npm library) architecture:');
console.log('  - Central listeners Map with string paths');
console.log('  - On update, iterates ALL listeners:');
console.log('    for (let [listenerPath, collection] of this.listeners) {');
console.log('      if (collection.match(updatePath)) { notify }');
console.log('    }');
console.log('  - Every update does O(listeners) path matching');
console.log('  - Complexity: O(listeners) per change');
console.log('');
console.log('Summary:');
console.log('  | Library              | Per-change complexity |');
console.log('  |----------------------|-----------------------|');
console.log('  | deepstate V1         | O(subscribers)        |');
console.log('  | deep-state-observer  | O(listeners)          |');
console.log('  | deepstate V2         | O(depth) <<<          |');

console.log('\n=== Comparison Complete ===');
