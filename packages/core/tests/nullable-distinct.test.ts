/**
 * Tests for nullable() helper with distinct options
 */

import { describe, test, expect } from 'bun:test';
import { state, nullable } from '../src';

describe('nullable() with options', () => {
  describe('no distinct (default behavior)', () => {
    test('deduplicates via JSON.stringify by default', () => {
      type State = { user: { name: string; age: number } | null };
      const store = state<State>({ user: nullable({ name: 'Alice', age: 30 }) });
      const emissions: ({ name: string; age: number } | null)[] = [];

      store.user?.subscribe(v => emissions.push(v));

      // Setting same structure should NOT re-emit (default is JSON.stringify dedup)
      store.user?.set({ name: 'Alice', age: 30 });

      expect(emissions.length).toBe(1); // Only initial
    });

    test('emits when values actually differ', () => {
      type State = { user: { name: string; age: number } | null };
      const store = state<State>({ user: nullable({ name: 'Alice', age: 30 }) });
      const emissions: ({ name: string; age: number } | null)[] = [];

      store.user?.subscribe(v => emissions.push(v));

      store.user?.set({ name: 'Bob', age: 25 });

      expect(emissions.length).toBe(2);
      expect(emissions).toEqual([
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ]);
    });

    test('nullable without options behaves the same as default', () => {
      type State = { user: { name: string } | null };
      const store = state<State>({ user: nullable({ name: 'Alice' }) });
      const emissions: ({ name: string } | null)[] = [];

      store.user?.subscribe(v => emissions.push(v));

      store.user?.set({ name: 'Alice' }); // Same structure
      store.user?.set({ name: 'Alice' }); // Same structure

      expect(emissions.length).toBe(1); // Only initial, deduped
    });
  });

  describe('distinct: false', () => {
    test('emits on every set even with same values', () => {
      type State = { user: { name: string; age: number } | null };
      const store = state<State>({ user: nullable({ name: 'Alice', age: 30 }, { distinct: false }) });
      const emissions: ({ name: string; age: number } | null)[] = [];

      store.user?.subscribe(v => emissions.push(v));

      store.user?.set({ name: 'Alice', age: 30 }); // Same values
      store.user?.set({ name: 'Alice', age: 30 }); // Same values

      expect(emissions.length).toBe(3); // initial + 2 sets
    });

    test('emits on set back to same structure after null', () => {
      type State = { user: { name: string } | null };
      const store = state<State>({ user: nullable({ name: 'Alice' }, { distinct: false }) });
      const emissions: ({ name: string } | null)[] = [];

      store.user?.subscribe(v => emissions.push(v));

      store.user?.set(null);
      store.user?.set({ name: 'Alice' }); // Same as initial

      expect(emissions.length).toBe(3); // initial + null + restore
    });
  });

  describe("distinct: 'shallow'", () => {
    test('does not emit when setting same primitive property values', () => {
      type State = { user: { name: string; age: number } | null };
      const store = state<State>({ user: nullable({ name: 'Alice', age: 30 }, { distinct: 'shallow' }) });
      const emissions: ({ name: string; age: number } | null)[] = [];

      store.user?.subscribe(v => emissions.push(v));

      store.user?.set({ name: 'Alice', age: 30 }); // Same values - no emit
      store.user?.set({ name: 'Alice', age: 30 }); // Same values - no emit

      expect(emissions.length).toBe(1); // Only initial
    });

    test('emits when property values differ', () => {
      type State = { user: { name: string; age: number } | null };
      const store = state<State>({ user: nullable({ name: 'Alice', age: 30 }, { distinct: 'shallow' }) });
      const emissions: ({ name: string; age: number } | null)[] = [];

      store.user?.subscribe(v => emissions.push(v));

      store.user?.set({ name: 'Alice', age: 30 }); // Same - no emit
      store.user?.set({ name: 'Bob', age: 30 });    // Different name - emit
      store.user?.set({ name: 'Bob', age: 30 });    // Same - no emit

      expect(emissions.length).toBe(2); // initial + 1 different
      expect(emissions).toEqual([
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 30 },
      ]);
    });

    test('emits for nested objects with different references', () => {
      type State = { config: { meta: { version: number } } | null };
      const store = state<State>({
        config: nullable({ meta: { version: 1 } }, { distinct: 'shallow' }),
      });
      const emissions: unknown[] = [];

      store.config?.subscribe(v => emissions.push(v));

      // Different object reference for meta - shallow uses === so will emit
      store.config?.set({ meta: { version: 1 } });

      expect(emissions.length).toBe(2); // Shallow doesn't compare nested object contents
    });

    test('handles null transitions correctly', () => {
      type State = { user: { name: string } | null };
      const store = state<State>({ user: nullable({ name: 'Alice' }, { distinct: 'shallow' }) });
      const emissions: ({ name: string } | null)[] = [];

      store.user?.subscribe(v => emissions.push(v));

      store.user?.set(null);
      store.user?.set(null); // Same null - no emit
      store.user?.set({ name: 'Bob' });

      expect(emissions.length).toBe(3); // initial + null + Bob
    });
  });

  describe("distinct: 'deep'", () => {
    test('does not emit when setting structurally equal objects', () => {
      type State = { user: { name: string; age: number } | null };
      const store = state<State>({ user: nullable({ name: 'Alice', age: 30 }, { distinct: 'deep' }) });
      const emissions: ({ name: string; age: number } | null)[] = [];

      store.user?.subscribe(v => emissions.push(v));

      store.user?.set({ name: 'Alice', age: 30 }); // Same structure - no emit
      store.user?.set({ name: 'Alice', age: 30 }); // Same structure - no emit

      expect(emissions.length).toBe(1); // Only initial
    });

    test('emits when object structure differs', () => {
      type State = { user: { name: string; age: number } | null };
      const store = state<State>({ user: nullable({ name: 'Alice', age: 30 }, { distinct: 'deep' }) });
      const emissions: ({ name: string; age: number } | null)[] = [];

      store.user?.subscribe(v => emissions.push(v));

      store.user?.set({ name: 'Alice', age: 30 }); // Same - no emit
      store.user?.set({ name: 'Bob', age: 25 });    // Different - emit
      store.user?.set({ name: 'Bob', age: 25 });    // Same - no emit

      expect(emissions.length).toBe(2);
    });

    test('works with nested objects', () => {
      type State = { config: { meta: { version: number; label: string } } | null };
      const store = state<State>({
        config: nullable({ meta: { version: 1, label: 'stable' } }, { distinct: 'deep' }),
      });
      const emissions: unknown[] = [];

      store.config?.subscribe(v => emissions.push(v));

      store.config?.set({ meta: { version: 1, label: 'stable' } }); // Same - no emit
      store.config?.set({ meta: { version: 2, label: 'beta' } });   // Different - emit

      expect(emissions.length).toBe(2);
    });
  });

  describe('distinct: custom function', () => {
    test('uses custom comparator for equality', () => {
      type User = { id: number; name: string; updatedAt: number };
      type State = { user: User | null };

      const store = state<State>({
        user: nullable({ id: 1, name: 'Alice', updatedAt: 100 }, {
          distinct: (a, b) => {
            if (a === null && b === null) return true;
            if (a === null || b === null) return false;
            return a.id === b.id;
          },
        }),
      });
      const emissions: (User | null)[] = [];

      store.user?.subscribe(v => emissions.push(v));

      // Same id, different name - no emit (custom comparator only checks id)
      store.user?.set({ id: 1, name: 'Bob', updatedAt: 200 });

      // Different id - emit
      store.user?.set({ id: 2, name: 'Charlie', updatedAt: 300 });

      expect(emissions.length).toBe(2); // initial + 1 (different id)
      expect(emissions[0]!.id).toBe(1);
      expect(emissions[1]!.id).toBe(2);
    });

    test('custom comparator receives both values including null', () => {
      type State = { user: { name: string } | null };
      const comparatorCalls: [unknown, unknown][] = [];

      const store = state<State>({
        user: nullable({ name: 'Alice' }, {
          distinct: (a, b) => {
            comparatorCalls.push([a, b]);
            if (a === null && b === null) return true;
            if (a === null || b === null) return false;
            return a.name === b.name;
          },
        }),
      });

      store.user?.subscribe(() => {});

      store.user?.set({ name: 'Alice' }); // Same name - no emit
      store.user?.set(null);               // null - emit

      expect(comparatorCalls.length).toBe(2);
    });
  });

  describe('nullable(null, options) — starts null with options', () => {
    test('get() returns null for initial state', () => {
      type State = { user: { name: string } | null };
      const store = state<State>({ user: nullable<{ name: string }>(null, { distinct: 'shallow' }) });

      expect(store.user?.get()).toBe(null);
    });

    test('initial emission is null, not an empty object', () => {
      type State = { user: { name: string } | null };
      const store = state<State>({ user: nullable<{ name: string }>(null, { distinct: false }) });
      const emissions: ({ name: string } | null)[] = [];

      store.user?.subscribe(v => emissions.push(v));

      expect(emissions).toEqual([null]);
    });

    test('distinct: false emits on every set', () => {
      type State = { user: { name: string } | null };
      const store = state<State>({ user: nullable<{ name: string }>(null, { distinct: false }) });
      const emissions: ({ name: string } | null)[] = [];

      store.user?.subscribe(v => emissions.push(v));

      store.user?.set({ name: 'Alice' });
      store.user?.set({ name: 'Alice' }); // Same - but distinct:false so emits

      expect(emissions.length).toBe(3); // null + Alice + Alice
    });

    test('distinct: shallow deduplicates when starting from null', () => {
      type State = { user: { name: string; age: number } | null };
      const store = state<State>({ user: nullable<{ name: string; age: number }>(null, { distinct: 'shallow' }) });
      const emissions: ({ name: string; age: number } | null)[] = [];

      store.user?.subscribe(v => emissions.push(v));

      store.user?.set({ name: 'Alice', age: 30 });
      store.user?.set({ name: 'Alice', age: 30 }); // Same - no emit

      expect(emissions.length).toBe(2); // null + Alice
    });

    test('child access returns undefined when starting null with options', () => {
      type State = { user: { name: string; age: number } | null };
      const store = state<State>({ user: nullable<{ name: string; age: number }>(null, { distinct: 'deep' }) });

      expect(store.user.name.get()).toBeUndefined();
    });

    test('transitions from null to object work correctly with options', () => {
      type State = { user: { name: string } | null };
      const store = state<State>({ user: nullable<{ name: string }>(null, { distinct: 'deep' }) });

      store.user?.set({ name: 'Alice' });
      expect(store.user?.get()).toEqual({ name: 'Alice' });
      expect(store.user?.name.get()).toBe('Alice');

      store.user?.set(null);
      expect(store.user?.get()).toBe(null);
    });
  });

  describe('interaction with other features', () => {
    test('distinct works with parent set after child changes', () => {
      type State = { user: { name: string; age: number } | null };
      const store = state<State>({ user: nullable({ name: 'Alice', age: 30 }, { distinct: 'deep' }) });
      const emissions: ({ name: string; age: number } | null)[] = [];

      store.user?.subscribe(v => emissions.push(v));

      // Setting parent to a new object with different values should emit
      store.user?.set({ name: 'Bob', age: 30 });

      expect(emissions.length).toBe(2);
      expect(emissions[1]).toEqual({ name: 'Bob', age: 30 });

      // Setting parent to same structure should NOT emit (deep distinct)
      store.user?.set({ name: 'Bob', age: 30 });

      expect(emissions.length).toBe(2);
    });

    test('distinct works with update() batching', () => {
      type State = { user: { name: string; age: number } | null };
      const store = state<State>({ user: nullable({ name: 'Alice', age: 30 }, { distinct: 'deep' }) });

      let emissions = 0;
      store.user?.subscribe(() => emissions++);
      emissions = 0;

      store.user?.update(user => {
        user.name.set('Bob');
        user.age.set(31);
      });

      // Should be 1 batched emission
      expect(emissions).toBe(1);
      expect(store.user?.get()).toEqual({ name: 'Bob', age: 31 });
    });
  });
});
