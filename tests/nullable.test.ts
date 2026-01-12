/**
 * Tests for nullable object support in deepstate v2
 */

import { describe, test, expect } from 'bun:test';
import { state, nullable } from '../src/deepstate-v2';

describe('nullable objects', () => {
  describe('basic nullable (starts null)', () => {
    test('should get null value', () => {
      type State = {
        user: { name: string; age: number } | null;
      };

      const store = state<State>({ user: null });

      expect(store.user?.get()).toBe(null);
    });

    test('should return undefined for child access when null', () => {
      type State = {
        user: { name: string; age: number } | null;
      };

      const store = state<State>({ user: null });

      // Child access should return undefined when null
      expect(store.user?.name).toBeUndefined();
    });

    test('should allow setting object value', () => {
      type State = {
        user: { name: string; age: number } | null;
      };

      const store = state<State>({ user: null });

      store.user?.set({ name: 'Alice', age: 30 });

      expect(store.user?.get()).toEqual({ name: 'Alice', age: 30 });
    });

    test('should allow child access after setting object', () => {
      type State = {
        user: { name: string; age: number } | null;
      };

      const store = state<State>({ user: null });

      store.user?.set({ name: 'Alice', age: 30 });

      expect(store.user?.name.get()).toBe('Alice');
    });

    test('should allow updating child after setting object', () => {
      type State = {
        user: { name: string; age: number } | null;
      };

      const store = state<State>({ user: null });

      store.user?.set({ name: 'Alice', age: 30 });
      store.user?.name.set('Bob');

      expect(store.user?.get()).toEqual({ name: 'Bob', age: 30 });
    });
  });

  describe('subscriptions on nullable', () => {
    test('should emit null initially', () => {
      type State = {
        user: { name: string } | null;
      };

      const store = state<State>({ user: null });
      const emissions: ({ name: string } | null)[] = [];

      store.user?.subscribe((val) => {
        emissions.push(val);
      });

      expect(emissions).toEqual([null]);
    });

    test('should emit on set to object', () => {
      type State = {
        user: { name: string } | null;
      };

      const store = state<State>({ user: null });
      const emissions: ({ name: string } | null)[] = [];

      store.user?.subscribe((val) => {
        emissions.push(val);
      });

      store.user?.set({ name: 'Alice' });

      expect(emissions).toEqual([null, { name: 'Alice' }]);
    });

    test('child changes are reflected in parent get()', () => {
      type State = {
        user: { name: string } | null;
      };

      const store = state<State>({ user: nullable({ name: 'Alice' }) });

      store.user?.name.set('Bob');

      expect(store.user?.get()).toEqual({ name: 'Bob' });
    });

    test('should emit on set back to null', () => {
      type State = {
        user: { name: string } | null;
      };

      const store = state<State>({ user: null });
      const emissions: ({ name: string } | null)[] = [];

      store.user?.subscribe((val) => {
        emissions.push(val);
      });

      store.user?.set({ name: 'Alice' });
      store.user?.set(null);

      expect(emissions).toEqual([null, { name: 'Alice' }, null]);
    });
  });

  describe('nullable() helper (starts with object)', () => {
    test('should get initial object value', () => {
      type State = {
        user: { name: string; age: number } | null;
      };

      const store = state<State>({ user: nullable({ name: 'Alice', age: 30 }) });

      expect(store.user?.get()).toEqual({ name: 'Alice', age: 30 });
    });

    test('should allow child access immediately', () => {
      type State = {
        user: { name: string; age: number } | null;
      };

      const store = state<State>({ user: nullable({ name: 'Alice', age: 30 }) });

      expect(store.user?.name.get()).toBe('Alice');
    });

    test('should allow updating child directly', () => {
      type State = {
        user: { name: string; age: number } | null;
      };

      const store = state<State>({ user: nullable({ name: 'Alice', age: 30 }) });

      store.user?.name.set('Bob');

      expect(store.user?.get()).toEqual({ name: 'Bob', age: 30 });
    });

    test('should allow setting to null', () => {
      type State = {
        user: { name: string; age: number } | null;
      };

      const store = state<State>({ user: nullable({ name: 'Alice', age: 30 }) });

      store.user?.set(null);

      expect(store.user?.get()).toBe(null);
    });

    test('should allow setting back to object after null', () => {
      type State = {
        user: { name: string; age: number } | null;
      };

      const store = state<State>({ user: nullable({ name: 'Alice', age: 30 }) });

      store.user?.set(null);
      store.user?.set({ name: 'Charlie', age: 25 });

      expect(store.user?.get()).toEqual({ name: 'Charlie', age: 25 });
      expect(store.user?.name.get()).toBe('Charlie');
    });
  });

  describe('updateIfPresent', () => {
    test('should be no-op when null', () => {
      type State = {
        user: { name: string; age: number } | null;
      };

      const store = state<State>({ user: null });

      store.user?.updateIfPresent((user) => {
        user.name.set('Should not happen');
      });

      expect(store.user?.get()).toBe(null);
    });

    test('should update when object present', () => {
      type State = {
        user: { name: string; age: number } | null;
      };

      const store = state<State>({ user: null });
      store.user?.set({ name: 'Alice', age: 30 });

      store.user?.updateIfPresent((user) => {
        user.name.set('Bob');
        user.age.set(31);
      });

      expect(store.user?.get()).toEqual({ name: 'Bob', age: 31 });
    });

    test('should batch emissions during updateIfPresent', () => {
      type State = {
        user: { name: string; age: number } | null;
      };

      const store = state<State>({ user: null });
      store.user?.set({ name: 'Alice', age: 30 });

      let emissions = 0;
      store.user?.subscribe(() => emissions++);
      emissions = 0; // Reset after initial

      store.user?.updateIfPresent((user) => {
        user.name.set('Bob');
        user.age.set(31);
      });

      // Should be 1 batched emission
      expect(emissions).toBe(1);
    });
  });

  describe('nested nullable', () => {
    test('should handle nested nullable object', () => {
      type State = {
        user: {
          name: string;
          address: { city: string; zip: string } | null;
        } | null;
      };

      const store = state<State>({
        user: nullable({
          name: 'Alice',
          address: null,
        }),
      });

      expect(store.user?.get()).toEqual({ name: 'Alice', address: null });
    });

    test('should set nested nullable', () => {
      type State = {
        user: {
          name: string;
          address: { city: string; zip: string } | null;
        } | null;
      };

      const store = state<State>({
        user: nullable({
          name: 'Alice',
          address: null,
        }),
      });

      store.user?.address?.set({ city: 'NYC', zip: '10001' });

      expect(store.user?.get()).toEqual({
        name: 'Alice',
        address: { city: 'NYC', zip: '10001' },
      });
    });

    test('should access deeply nested after setting', () => {
      type State = {
        user: {
          name: string;
          address: { city: string; zip: string } | null;
        } | null;
      };

      const store = state<State>({
        user: nullable({
          name: 'Alice',
          address: null,
        }),
      });

      store.user?.address?.set({ city: 'NYC', zip: '10001' });

      expect(store.user?.address?.city.get()).toBe('NYC');
    });
  });

  describe('non-nullable still works', () => {
    test('should work normally with non-nullable objects', () => {
      const store = state({
        user: { name: 'Alice', age: 30 },
        count: 0,
      });

      expect(store.user.name.get()).toBe('Alice');

      store.user.name.set('Bob');
      store.count.set(5);

      expect(store.user.name.get()).toBe('Bob');
      expect(store.count.get()).toBe(5);
    });

    test('should support update() on non-nullable', () => {
      const store = state({
        user: { name: 'Alice', age: 30 },
      });

      store.user.update((draft) => {
        draft.name.set('Charlie');
        draft.age.set(25);
      });

      expect(store.user.get()).toEqual({ name: 'Charlie', age: 25 });
    });
  });
});
