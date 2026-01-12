/**
 * Edge case tests
 */

import { describe, test, expect } from 'bun:test';
import { state } from '../src/deepstate-v2';

describe('edge cases', () => {
  describe('empty structures', () => {
    test('should handle empty object', () => {
      const store = state({ empty: {} });

      expect(store.empty.get()).toEqual({});
    });

    test('should subscribe to empty object', () => {
      const store = state({ empty: {} });
      let received: unknown;

      store.empty.subscribe((val) => {
        received = val;
      });

      expect(received).toEqual({});
    });

    test('should handle empty array', () => {
      const store = state({ items: [] as { id: number }[] });

      expect(store.items.get()).toEqual([]);
      expect(store.items.length.get()).toBe(0);
    });
  });

  describe('nullable/undefined values', () => {
    test('should handle null property', () => {
      const store = state({
        maybeValue: null as string | null,
      });

      expect(store.maybeValue.get()).toBe(null);
    });

    test('should handle undefined property', () => {
      const store = state({
        undefinedValue: undefined as string | undefined,
      });

      expect(store.undefinedValue.get()).toBe(undefined);
    });

    test('should set value when starting with non-null', () => {
      const store = state({
        maybeValue: 'initial' as string | null,
      });

      store.maybeValue.set('changed');

      expect(store.maybeValue.get()).toBe('changed');
    });

    test('should set value to null', () => {
      const store = state({
        maybeValue: 'has value' as string | null,
      });

      store.maybeValue.set(null);

      expect(store.maybeValue.get()).toBe(null);
    });
  });

  describe('falsy values', () => {
    test('should preserve numeric zero', () => {
      const store = state({ count: 0 });

      expect(store.count.get()).toBe(0);
    });

    test('should preserve empty string', () => {
      const store = state({ text: '' });

      expect(store.text.get()).toBe('');
    });

    test('should preserve false boolean', () => {
      const store = state({ enabled: false });

      expect(store.enabled.get()).toBe(false);
    });

    test('should handle boolean transitions', () => {
      const store = state({ enabled: false });
      const emissions: boolean[] = [];

      store.enabled.subscribe((v) => emissions.push(v));

      store.enabled.set(true);
      store.enabled.set(false);

      expect(emissions).toEqual([false, true, false]);
    });
  });

  describe('nullable objects', () => {
    test('should handle nullable nested object', () => {
      type NullableState = {
        user: { name: string; age: number } | null;
      };

      const store = state<NullableState>({
        user: null,
      });

      expect(store.user?.get()).toBe(null);
    });

    test('should set nullable object from null to value', () => {
      type NullableState = {
        user: { name: string; age: number } | null;
      };

      const store = state<NullableState>({
        user: null,
      });

      store.user?.set({ name: 'Alice', age: 30 });

      expect(store.user?.get()).toEqual({ name: 'Alice', age: 30 });
    });

    test('should subscribe to nullable object changes', () => {
      type NullableState = {
        user: { name: string; age: number } | null;
      };

      const store = state<NullableState>({
        user: null,
      });

      const emissions: ({ name: string; age: number } | null)[] = [];
      store.user?.subscribe((v) => emissions.push(v));

      store.user?.set({ name: 'Alice', age: 30 });

      expect(emissions).toEqual([null, { name: 'Alice', age: 30 }]);
    });
  });

  describe('type coercion edge cases', () => {
    test('should handle NaN', () => {
      const store = state({ value: NaN });

      expect(store.value.get()).toBeNaN();
    });

    test('should handle Infinity', () => {
      const store = state({ value: Infinity });

      expect(store.value.get()).toBe(Infinity);
    });

    test('should handle negative Infinity', () => {
      const store = state({ value: -Infinity });

      expect(store.value.get()).toBe(-Infinity);
    });
  });
});
