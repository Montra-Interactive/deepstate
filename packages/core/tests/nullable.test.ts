/**
 * Tests for nullable object support in deepstate v2
 */

import { describe, test, expect } from 'bun:test';
import { state, nullable } from '../src';

describe('nullable objects', () => {
  describe('basic nullable (starts null)', () => {
    test('should get null value', () => {
      type State = {
        user: { name: string; age: number } | null;
      };

      const store = state<State>({ user: null });

      expect(store.user?.get()).toBe(null);
    });

    test('should return undefined from .get() for child when parent is null', () => {
      type State = {
        user: { name: string; age: number } | null;
      };

      const store = state<State>({ user: null });

      // Child node always exists (for deep subscription), but get() returns undefined when parent is null
      expect(store.user.name.get()).toBeUndefined();
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

  describe('update() on nullable', () => {
    test('should update when object present', () => {
      type State = {
        user: { name: string; age: number } | null;
      };

      const store = state<State>({ user: null });
      store.user?.set({ name: 'Alice', age: 30 });

      store.user?.update((user) => {
        user.name.set('Bob');
        user.age.set(31);
      });

      expect(store.user?.get()).toEqual({ name: 'Bob', age: 31 });
    });

    test('should batch emissions during update', () => {
      type State = {
        user: { name: string; age: number } | null;
      };

      const store = state<State>({ user: null });
      store.user?.set({ name: 'Alice', age: 30 });

      let emissions = 0;
      store.user?.subscribe(() => emissions++);
      emissions = 0; // Reset after initial

      store.user?.update((user) => {
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

  describe('deep subscription through null', () => {
    test('should allow subscribing to child when parent is null', () => {
      type State = {
        user: { name: string; age: number } | null;
      };

      const store = state<State>({ user: null });
      const emissions: (string | undefined)[] = [];

      // Subscribe to name even though user is null
      store.user.name.subscribe((name) => {
        emissions.push(name);
      });

      // Should emit undefined initially since parent is null
      expect(emissions).toEqual([undefined]);
    });

    test('should emit value when parent is set after subscription', () => {
      type State = {
        user: { name: string; age: number } | null;
      };

      const store = state<State>({ user: null });
      const emissions: (string | undefined)[] = [];

      // Subscribe to name while user is null
      store.user.name.subscribe((name) => {
        emissions.push(name);
      });

      // Now set user to an object
      store.user.set({ name: 'Alice', age: 30 });

      expect(emissions).toEqual([undefined, 'Alice']);
    });

    test('should emit undefined when parent is set back to null', () => {
      type State = {
        user: { name: string } | null;
      };

      const store = state<State>({ user: null });
      const emissions: (string | undefined)[] = [];

      store.user.name.subscribe((name) => {
        emissions.push(name);
      });

      store.user.set({ name: 'Alice' });
      store.user.set(null);

      expect(emissions).toEqual([undefined, 'Alice', undefined]);
    });

    test('should track child updates after parent is set', () => {
      type State = {
        user: { name: string } | null;
      };

      const store = state<State>({ user: null });
      const emissions: (string | undefined)[] = [];

      store.user.name.subscribe((name) => {
        emissions.push(name);
      });

      store.user.set({ name: 'Alice' });
      store.user.name.set('Bob');

      expect(emissions).toEqual([undefined, 'Alice', 'Bob']);
    });

    test('should support multiple child subscriptions simultaneously', () => {
      type State = {
        user: { name: string; age: number } | null;
      };

      const store = state<State>({ user: null });
      const nameEmissions: (string | undefined)[] = [];
      const ageEmissions: (number | undefined)[] = [];

      store.user.name.subscribe((name) => nameEmissions.push(name));
      store.user.age.subscribe((age) => ageEmissions.push(age));

      store.user.set({ name: 'Alice', age: 30 });

      expect(nameEmissions).toEqual([undefined, 'Alice']);
      expect(ageEmissions).toEqual([undefined, 30]);
    });

    test('child .get() returns undefined when parent is null', () => {
      type State = {
        user: { name: string } | null;
      };

      const store = state<State>({ user: null });

      expect(store.user.name.get()).toBeUndefined();
    });

    test('child .get() returns value when parent has value', () => {
      type State = {
        user: { name: string } | null;
      };

      const store = state<State>({ user: null });
      store.user.set({ name: 'Alice' });

      expect(store.user.name.get()).toBe('Alice');
    });
  });

  describe('primitive | null types', () => {
    test('should handle string | null starting with null', () => {
      type State = {
        selectedId: string | null;
      };

      const store = state<State>({ selectedId: null });

      expect(store.selectedId.get()).toBe(null);

      store.selectedId.set('123');
      expect(store.selectedId.get()).toBe('123');

      store.selectedId.set('456');
      expect(store.selectedId.get()).toBe('456');

      store.selectedId.set(null);
      expect(store.selectedId.get()).toBe(null);
    });

    test('should handle number | null starting with null', () => {
      type State = {
        count: number | null;
      };

      const store = state<State>({ count: null });

      expect(store.count.get()).toBe(null);

      store.count.set(42);
      expect(store.count.get()).toBe(42);

      store.count.set(0);
      expect(store.count.get()).toBe(0);

      store.count.set(null);
      expect(store.count.get()).toBe(null);
    });

    test('should handle boolean | null starting with null', () => {
      type State = {
        isActive: boolean | null;
      };

      const store = state<State>({ isActive: null });

      expect(store.isActive.get()).toBe(null);

      store.isActive.set(true);
      expect(store.isActive.get()).toBe(true);

      store.isActive.set(false);
      expect(store.isActive.get()).toBe(false);

      store.isActive.set(null);
      expect(store.isActive.get()).toBe(null);
    });

    test('should handle string | null starting with string', () => {
      type State = {
        selectedId: string | null;
      };

      const store = state<State>({ selectedId: '000' });

      expect(store.selectedId.get()).toBe('000');

      store.selectedId.set(null);
      expect(store.selectedId.get()).toBe(null);

      store.selectedId.set('123');
      expect(store.selectedId.get()).toBe('123');
    });

    test('should emit values through subscriptions for primitive | null', () => {
      type State = {
        selectedId: string | null;
      };

      const store = state<State>({ selectedId: null });
      const emissions: (string | null)[] = [];

      store.selectedId.subscribe((val) => {
        emissions.push(val);
      });

      store.selectedId.set('123');
      store.selectedId.set('456');
      store.selectedId.set(null);
      store.selectedId.set('789');

      expect(emissions).toEqual([null, '123', '456', null, '789']);
    });

    test('should handle multiple primitive | null properties', () => {
      type State = {
        name: string | null;
        age: number | null;
        isActive: boolean | null;
      };

      const store = state<State>({
        name: null,
        age: null,
        isActive: null,
      });

      expect(store.get()).toEqual({
        name: null,
        age: null,
        isActive: null,
      });

      store.name.set('Alice');
      store.age.set(30);
      store.isActive.set(true);

      expect(store.get()).toEqual({
        name: 'Alice',
        age: 30,
        isActive: true,
      });
    });

    test('should handle primitive | null alongside object | null', () => {
      type State = {
        selectedSceneId: string | null;
        error: { message: string; code: number } | null;
      };

      const store = state<State>({
        selectedSceneId: null,
        error: null,
      });

      store.selectedSceneId.set('scene-1');
      store.error.set({ message: 'Something went wrong', code: 500 });

      expect(store.get()).toEqual({
        selectedSceneId: 'scene-1',
        error: { message: 'Something went wrong', code: 500 },
      });

      store.selectedSceneId.set(null);
      store.error.set(null);

      expect(store.get()).toEqual({
        selectedSceneId: null,
        error: null,
      });
    });

    test('should work in a realistic store scenario', () => {
      type State = {
        isPlaying: boolean;
        currentSceneIndex: number;
        selectedSceneId: string | null;
        error: { message: string } | null;
      };

      const store = state<State>({
        isPlaying: false,
        currentSceneIndex: 0,
        selectedSceneId: null,
        error: null,
      });

      // Simulate playback starting
      store.isPlaying.set(true);
      store.selectedSceneId.set('scene-001');

      expect(store.isPlaying.get()).toBe(true);
      expect(store.selectedSceneId.get()).toBe('scene-001');

      // Simulate scene change
      store.currentSceneIndex.set(1);
      store.selectedSceneId.set('scene-002');

      expect(store.currentSceneIndex.get()).toBe(1);
      expect(store.selectedSceneId.get()).toBe('scene-002');

      // Simulate error
      store.error.set({ message: 'Playback failed' });
      store.isPlaying.set(false);

      expect(store.error.get()).toEqual({ message: 'Playback failed' });
      expect(store.isPlaying.get()).toBe(false);

      // Clear error
      store.error.set(null);
      expect(store.error.get()).toBe(null);
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
