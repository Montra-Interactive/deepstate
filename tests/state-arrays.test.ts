/**
 * Array operations tests
 */

import { describe, test, expect } from 'bun:test';
import { state } from '../src/deepstate-v2';

describe('arrays', () => {
  describe('at() accessor', () => {
    test('should access array items by index', () => {
      const store = state({
        items: [
          { id: 1, name: 'Widget' },
          { id: 2, name: 'Gadget' },
        ],
      });

      expect(store.items.at(0)?.name.get()).toBe('Widget');
      expect(store.items.at(1)?.name.get()).toBe('Gadget');
    });

    test('should allow setting nested array item properties', () => {
      const store = state({
        items: [{ id: 1, name: 'Widget' }],
      });

      store.items.at(0)?.name.set('Super Widget');

      expect(store.items.at(0)?.name.get()).toBe('Super Widget');
      expect(store.items.get()).toEqual([{ id: 1, name: 'Super Widget' }]);
    });

    test('should return undefined for out of bounds index', () => {
      const store = state({ items: [{ id: 1 }] });

      expect(store.items.at(99)).toBeUndefined();
    });

    test('should return undefined for negative index', () => {
      const store = state({ items: [{ id: 1 }, { id: 2 }, { id: 3 }] });

      // Note: Our at() doesn't support negative indices like Array.at()
      expect(store.items.at(-1)).toBeUndefined();
    });
  });

  describe('array of primitives', () => {
    test('should get array of primitives', () => {
      const store = state({ numbers: [1, 2, 3] });

      expect(store.numbers.get()).toEqual([1, 2, 3]);
    });

    test('should access primitive element with at()', () => {
      const store = state({ numbers: [1, 2, 3] });

      expect(store.numbers.at(0)?.get()).toBe(1);
    });

    test('should set primitive element', () => {
      const store = state({ numbers: [1, 2, 3] });

      store.numbers.at(0)?.set(10);

      expect(store.numbers.get()).toEqual([10, 2, 3]);
    });
  });

  describe('sibling isolation', () => {
    test('array item siblings should NOT emit when one changes', () => {
      const store = state({
        items: [
          { id: 1, name: 'A', price: 10 },
          { id: 2, name: 'B', price: 20 },
        ],
      });

      let item0NameEmits = 0;
      let item0PriceEmits = 0;
      let item1NameEmits = 0;

      store.items.at(0)?.name.subscribe(() => item0NameEmits++);
      store.items.at(0)?.price.subscribe(() => item0PriceEmits++);
      store.items.at(1)?.name.subscribe(() => item1NameEmits++);

      // Reset after initial
      item0NameEmits = 0;
      item0PriceEmits = 0;
      item1NameEmits = 0;

      store.items.at(0)?.name.set('AA');

      expect(item0NameEmits).toBe(1);
      expect(item0PriceEmits).toBe(0);
      expect(item1NameEmits).toBe(0);
    });
  });

  describe('push/pop', () => {
    test('should push single item', () => {
      const store = state({
        items: [{ id: 1 }],
      });

      const newLen = store.items.push({ id: 2 });

      expect(newLen).toBe(2);
      expect(store.items.length.get()).toBe(2);
      expect(store.items.get()).toEqual([{ id: 1 }, { id: 2 }]);
    });

    test('should push multiple items', () => {
      const store = state({
        items: [{ id: 1, name: 'First' }],
      });

      const newLen = store.items.push({ id: 2, name: 'Second' }, { id: 3, name: 'Third' });

      expect(newLen).toBe(3);
      expect(store.items.length.get()).toBe(3);
    });

    test('should pop item', () => {
      const store = state({
        items: [
          { id: 1, name: 'First' },
          { id: 2, name: 'Second' },
        ],
      });

      const popped = store.items.pop();

      expect(popped).toEqual({ id: 2, name: 'Second' });
      expect(store.items.length.get()).toBe(1);
    });

    test('should push to empty array', () => {
      const store = state({ items: [] as { id: number }[] });

      store.items.push({ id: 1 });

      expect(store.items.length.get()).toBe(1);
      expect(store.items.get()).toEqual([{ id: 1 }]);
    });
  });

  describe('map/filter', () => {
    test('should map array items', () => {
      const store = state({
        items: [
          { id: 1, name: 'A' },
          { id: 2, name: 'B' },
          { id: 3, name: 'C' },
        ],
      });

      const names = store.items.map((item) => item.name);

      expect(names).toEqual(['A', 'B', 'C']);
    });

    test('should filter array items', () => {
      const store = state({
        items: [
          { id: 1, active: true },
          { id: 2, active: false },
          { id: 3, active: true },
        ],
      });

      const activeItems = store.items.filter((item) => item.active);

      expect(activeItems).toHaveLength(2);
      expect(activeItems.map((i) => i.id)).toEqual([1, 3]);
    });
  });

  describe('length observable', () => {
    test('should get initial length', () => {
      const store = state({ items: [1, 2, 3] });

      expect(store.items.length.get()).toBe(3);
    });

    test('should emit length changes', () => {
      const store = state({ items: [1, 2, 3] });
      const emissions: number[] = [];

      store.items.length.subscribe((len) => emissions.push(len));

      store.items.push(4);
      store.items.pop();

      expect(emissions).toEqual([3, 4, 3]);
    });

    test('should handle empty array length', () => {
      const store = state({ items: [] as number[] });

      expect(store.items.length.get()).toBe(0);
    });
  });
});
