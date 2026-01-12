/**
 * Tests comparing v1 vs v2 emission behavior
 *
 * The key difference: v2 has O(depth) complexity per change,
 * while v1 has O(subscribers) complexity.
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import {
  state as stateV1,
  deepEqualCallCount,
  resetDeepEqualCallCount,
} from '../src/deepstate';
import {
  state as stateV2,
  distinctCallCount,
  resetDistinctCallCount,
} from '../src/deepstate-v2';

describe('v1 vs v2 comparison', () => {
  beforeEach(() => {
    resetDeepEqualCallCount();
    resetDistinctCallCount();
  });

  describe('sibling emission behavior', () => {
    test('v1: all subscribers are notified on any change', () => {
      const store = stateV1({
        user: { name: 'Alice', age: 30 },
        settings: { theme: 'dark', lang: 'en' },
      });

      let nameEmits = 0;
      let ageEmits = 0;
      let themeEmits = 0;
      let langEmits = 0;

      store.user.name.subscribe(() => nameEmits++);
      store.user.age.subscribe(() => ageEmits++);
      store.settings.theme.subscribe(() => themeEmits++);
      store.settings.lang.subscribe(() => langEmits++);

      // Reset after initial emissions
      nameEmits = 0;
      ageEmits = 0;
      themeEmits = 0;
      langEmits = 0;
      resetDeepEqualCallCount();

      // Change only user.name
      store.user.name.set('Bob');

      // V1 notifies all, but distinctUntilChanged filters
      // All 4 subscribers run their comparison logic
      expect(nameEmits).toBe(1);
      expect(ageEmits).toBe(0); // Filtered by distinctUntilChanged
      expect(themeEmits).toBe(0); // Filtered by distinctUntilChanged
      expect(langEmits).toBe(0); // Filtered by distinctUntilChanged

      // V1 does deepEqual for every subscriber
      expect(deepEqualCallCount).toBe(4);
    });

    test('v2: only affected path is notified', () => {
      const store = stateV2({
        user: { name: 'Alice', age: 30 },
        settings: { theme: 'dark', lang: 'en' },
      });

      let nameEmits = 0;
      let ageEmits = 0;
      let themeEmits = 0;
      let langEmits = 0;

      store.user.name.subscribe(() => nameEmits++);
      store.user.age.subscribe(() => ageEmits++);
      store.settings.theme.subscribe(() => themeEmits++);
      store.settings.lang.subscribe(() => langEmits++);

      // Reset after initial emissions
      nameEmits = 0;
      ageEmits = 0;
      themeEmits = 0;
      langEmits = 0;
      resetDistinctCallCount();

      // Change only user.name
      store.user.name.set('Bob');

      // V2 only notifies affected path
      expect(nameEmits).toBe(1);
      expect(ageEmits).toBe(0); // Never notified
      expect(themeEmits).toBe(0); // Never notified
      expect(langEmits).toBe(0); // Never notified

      // V2 does far fewer comparisons (only for the affected path)
      expect(distinctCallCount).toBeLessThan(4);
    });
  });

  describe('scale comparison', () => {
    test('v2 does fewer comparisons with many subscribers', () => {
      const createManyPropsState = () => {
        const obj: Record<string, { value: number }> = {};
        for (let i = 0; i < 20; i++) {
          obj[`prop${i}`] = { value: i };
        }
        return obj;
      };

      const storeV1Instance = stateV1(createManyPropsState());
      const storeV2Instance = stateV2(createManyPropsState());

      // Subscribe to all 20 properties
      for (let i = 0; i < 20; i++) {
        (storeV1Instance as Record<string, { value: { subscribe: (cb: () => void) => void } }>)[`prop${i}`]!.value.subscribe(() => {});
        (storeV2Instance as Record<string, { value: { subscribe: (cb: () => void) => void } }>)[`prop${i}`]!.value.subscribe(() => {});
      }

      resetDeepEqualCallCount();
      resetDistinctCallCount();

      // Change just prop0.value
      (storeV1Instance as Record<string, { value: { set: (v: number) => void } }>)[`prop0`]!.value.set(999);
      const v1Calls = deepEqualCallCount;

      resetDistinctCallCount();
      (storeV2Instance as Record<string, { value: { set: (v: number) => void } }>)[`prop0`]!.value.set(999);
      const v2Calls = distinctCallCount;

      // V1 checks all 20 subscribers, V2 only checks affected path
      expect(v1Calls).toBe(20);
      expect(v2Calls).toBeLessThan(v1Calls);
    });
  });

  describe('functional equivalence', () => {
    test('both v1 and v2 produce same final values', () => {
      const initialState = {
        user: { name: 'Alice', age: 30 },
        count: 0,
      };

      const v1Store = stateV1({ ...initialState });
      const v2Store = stateV2({ ...initialState });

      // Perform same operations
      v1Store.user.name.set('Bob');
      v2Store.user.name.set('Bob');

      v1Store.count.set(5);
      v2Store.count.set(5);

      // Both should have same values
      expect(v1Store.user.name.get()).toBe(v2Store.user.name.get());
      expect(v1Store.user.age.get()).toBe(v2Store.user.age.get());
      expect(v1Store.count.get()).toBe(v2Store.count.get());
    });

    test('both v1 and v2 emit same number of visible emissions', () => {
      const v1Store = stateV1({ value: 'initial' });
      const v2Store = stateV2({ value: 'initial' });

      const v1Emissions: string[] = [];
      const v2Emissions: string[] = [];

      v1Store.value.subscribe((v) => v1Emissions.push(v));
      v2Store.value.subscribe((v) => v2Emissions.push(v));

      v1Store.value.set('changed');
      v2Store.value.set('changed');

      v1Store.value.set('again');
      v2Store.value.set('again');

      expect(v1Emissions).toEqual(v2Emissions);
    });
  });
});
