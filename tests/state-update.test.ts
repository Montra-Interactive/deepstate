/**
 * Tests for update() batching functionality
 */

import { describe, test, expect } from 'bun:test';
import { state } from '../src/deepstate-v2';

describe('update() batching', () => {
  describe('basic batching', () => {
    test('individual sets cause multiple emissions', () => {
      const store = state({ user: { name: 'Alice', age: 30 } });
      let emissions = 0;
      store.user.subscribe(() => emissions++);
      emissions = 0;

      store.user.name.set('Bob');
      store.user.age.set(31);

      expect(emissions).toBe(2);
    });

    test('update() causes single emission', () => {
      const store = state({ user: { name: 'Alice', age: 30 } });
      let emissions = 0;
      store.user.subscribe(() => emissions++);
      emissions = 0;

      store.user.update((draft) => {
        draft.name.set('Bob');
        draft.age.set(31);
      });

      expect(emissions).toBe(1);
    });

    test('update() with many changes still causes single emission', () => {
      const store = state({
        a: 1,
        b: 2,
        c: 3,
        d: 4,
        e: 5,
      });
      let emissions = 0;
      store.subscribe(() => emissions++);
      emissions = 0;

      store.update((draft) => {
        draft.a.set(10);
        draft.b.set(20);
        draft.c.set(30);
        draft.d.set(40);
        draft.e.set(50);
      });

      expect(emissions).toBe(1);
    });
  });

  describe('value correctness', () => {
    test('update() returns correct final value', () => {
      const store = state({ name: 'Alice', age: 30 });

      const result = store.update((draft) => {
        draft.name.set('Bob');
        draft.age.set(31);
      });

      expect(result.name).toBe('Bob');
      expect(result.age).toBe(31);
    });

    test('get() returns correct value after update()', () => {
      const store = state({ name: 'Alice', age: 30 });

      store.update((draft) => {
        draft.name.set('Bob');
        draft.age.set(31);
      });

      expect(store.name.get()).toBe('Bob');
      expect(store.age.get()).toBe(31);
    });

    test('subscriber receives correct value after update()', () => {
      const store = state({ name: 'Alice', age: 30 });
      let receivedValue: unknown = null;
      store.subscribe((v) => {
        receivedValue = v;
      });

      store.update((draft) => {
        draft.name.set('Bob');
        draft.age.set(31);
      });

      expect(receivedValue).not.toBeNull();
      const value = receivedValue as { name: string; age: number };
      expect(value.name).toBe('Bob');
      expect(value.age).toBe(31);
    });
  });

  describe('sibling isolation', () => {
    test('siblings do not emit during update()', () => {
      const store = state({
        user: { name: 'Alice' },
        settings: { theme: 'dark' },
      });
      let settingsEmissions = 0;
      store.settings.subscribe(() => settingsEmissions++);
      settingsEmissions = 0;

      store.user.update((draft) => {
        draft.name.set('Bob');
      });

      expect(settingsEmissions).toBe(0);
    });

    test('deeply nested siblings do not emit', () => {
      const store = state({
        a: { nested: { value: 1 } },
        b: { nested: { value: 2 } },
      });
      let bEmissions = 0;
      store.b.nested.value.subscribe(() => bEmissions++);
      bEmissions = 0;

      store.a.nested.update((draft) => {
        draft.value.set(100);
      });

      expect(bEmissions).toBe(0);
    });
  });

  describe('parent propagation', () => {
    test('parent emits once when child update() completes', () => {
      const store = state({ user: { name: 'Alice', age: 30 } });
      let rootEmissions = 0;
      store.subscribe(() => rootEmissions++);
      rootEmissions = 0;

      store.user.update((draft) => {
        draft.name.set('Bob');
        draft.age.set(31);
      });

      expect(rootEmissions).toBe(1);
    });

    test('grandparent emits once when deeply nested update() completes', () => {
      const store = state({
        level1: {
          level2: {
            value: 1,
            other: 2,
          },
        },
      });
      let rootEmissions = 0;
      store.subscribe(() => rootEmissions++);
      rootEmissions = 0;

      store.level1.level2.update((draft) => {
        draft.value.set(10);
        draft.other.set(20);
      });

      expect(rootEmissions).toBe(1);
    });
  });

  describe('array update()', () => {
    test('array update() causes single emission', () => {
      const store = state({ items: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }] });
      let emissions = 0;
      store.items.subscribe(() => emissions++);
      emissions = 0;

      store.items.update((draft) => {
        draft.at(0)?.name.set('Alpha');
        draft.at(1)?.name.set('Beta');
      });

      expect(emissions).toBe(1);
    });

    test('array update() with push causes single emission', () => {
      const store = state({ items: [{ id: 1 }] });
      let emissions = 0;
      store.items.subscribe(() => emissions++);
      emissions = 0;

      store.items.update((draft) => {
        draft.push({ id: 2 });
        draft.push({ id: 3 });
      });

      expect(emissions).toBe(1);
    });

    test('array update() with pop causes single emission', () => {
      const store = state({ items: [1, 2, 3, 4, 5] });
      let emissions = 0;
      store.items.subscribe(() => emissions++);
      emissions = 0;

      store.items.update((draft) => {
        draft.pop();
        draft.pop();
      });

      expect(emissions).toBe(1);
      expect(store.items.get()).toHaveLength(3);
    });

    test('array update() with mixed operations causes single emission', () => {
      const store = state({ items: [{ id: 1, name: 'A' }] });
      let emissions = 0;
      store.items.subscribe(() => emissions++);
      emissions = 0;

      store.items.update((draft) => {
        draft.at(0)?.name.set('Alpha');
        draft.push({ id: 2, name: 'Beta' });
        draft.push({ id: 3, name: 'Gamma' });
      });

      const items = store.items.get();
      expect(emissions).toBe(1);
      expect(items).toHaveLength(3);
      expect(items[0]?.name).toBe('Alpha');
      expect(items[2]?.name).toBe('Gamma');
    });

    test('array length observable updates correctly after update()', () => {
      const store = state({ items: [1, 2, 3] });
      const lengthValues: number[] = [];
      store.items.length.subscribe((len) => lengthValues.push(len));
      lengthValues.length = 0; // Clear

      store.items.update((draft) => {
        draft.push(4);
        draft.push(5);
      });

      expect(lengthValues).toEqual([5]);
    });
  });

  describe('edge cases', () => {
    test('empty update() still emits once', () => {
      const store = state({ value: 1 });
      let emissions = 0;
      store.subscribe(() => emissions++);
      emissions = 0;

      store.update(() => {
        // No changes
      });

      expect(emissions).toBe(1);
    });

    test('update() with no actual value change emits once', () => {
      const store = state({ value: 1 });
      let emissions = 0;
      store.subscribe(() => emissions++);
      emissions = 0;

      store.update((draft) => {
        draft.value.set(1); // Same value
      });

      expect(emissions).toBe(1);
    });

    test('multiple set() calls in update() uses last value', () => {
      const store = state({ a: 1, b: 2 });
      let emissions = 0;
      store.subscribe(() => emissions++);
      emissions = 0;

      store.update((draft) => {
        draft.a.set(10);
        draft.a.set(20); // Overwrite
        draft.b.set(30);
      });

      expect(emissions).toBe(1);
      expect(store.a.get()).toBe(20);
      expect(store.b.get()).toBe(30);
    });

    test('sequential update() calls work correctly', () => {
      const store = state({ value: 1 });
      let emissions = 0;
      store.subscribe(() => emissions++);
      emissions = 0;

      store.update((draft) => {
        draft.value.set(10);
      });
      store.update((draft) => {
        draft.value.set(20);
      });

      expect(emissions).toBe(2);
      expect(store.value.get()).toBe(20);
    });

    test('error in update() callback still unlocks', () => {
      const store = state({ value: 1 });

      try {
        store.update(() => {
          throw new Error('Test error');
        });
      } catch {
        // Expected
      }

      // After error, should still be able to use the store
      store.value.set(10);

      expect(store.value.get()).toBe(10);
    });
  });

  describe('root-level update()', () => {
    test('root update() batches all changes', () => {
      const store = state({
        user: { name: 'Alice' },
        settings: { theme: 'dark' },
        count: 0,
      });
      let emissions = 0;
      store.subscribe(() => emissions++);
      emissions = 0;

      store.update((draft) => {
        draft.user.name.set('Bob');
        draft.settings.theme.set('light');
        draft.count.set(5);
      });

      expect(emissions).toBe(1);
      expect(store.user.name.get()).toBe('Bob');
      expect(store.settings.theme.get()).toBe('light');
      expect(store.count.get()).toBe(5);
    });
  });
});
