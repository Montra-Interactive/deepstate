/**
 * Tests for array() helper with distinct options
 */

import { describe, test, expect } from 'bun:test';
import { state, array } from '../src';

describe('array() helper', () => {
  describe('no distinct (default behavior)', () => {
    test('emits on every set even with same values', () => {
      const store = state({ items: [1, 2, 3] });
      const emissions: number[][] = [];
      
      store.items.subscribe(v => emissions.push([...v]));
      
      store.items.set([1, 2, 3]); // Same values
      store.items.set([1, 2, 3]); // Same values
      
      expect(emissions.length).toBe(3); // initial + 2 sets
      expect(emissions).toEqual([
        [1, 2, 3],
        [1, 2, 3],
        [1, 2, 3],
      ]);
    });

    test('array without helper behaves the same as default', () => {
      const store = state({ items: array([1, 2, 3]) }); // No distinct option
      const emissions: number[][] = [];
      
      store.items.subscribe(v => emissions.push([...v]));
      
      store.items.set([1, 2, 3]);
      store.items.set([1, 2, 3]);
      
      expect(emissions.length).toBe(3);
    });
  });

  describe('distinct: false', () => {
    test('explicitly disabled distinct emits on every set', () => {
      const store = state({ items: array([1, 2, 3], { distinct: false }) });
      const emissions: number[][] = [];
      
      store.items.subscribe(v => emissions.push([...v]));
      
      store.items.set([1, 2, 3]);
      store.items.set([1, 2, 3]);
      
      expect(emissions.length).toBe(3);
    });
  });

  describe("distinct: 'shallow'", () => {
    test('does not emit when setting same primitive values', () => {
      const store = state({ items: array([1, 2, 3], { distinct: 'shallow' }) });
      const emissions: number[][] = [];
      
      store.items.subscribe(v => emissions.push([...v]));
      
      store.items.set([1, 2, 3]); // Same - no emit
      store.items.set([1, 2, 3]); // Same - no emit
      
      expect(emissions.length).toBe(1); // Only initial
    });

    test('emits when values differ', () => {
      const store = state({ items: array([1, 2, 3], { distinct: 'shallow' }) });
      const emissions: number[][] = [];
      
      store.items.subscribe(v => emissions.push([...v]));
      
      store.items.set([1, 2, 3]); // Same - no emit
      store.items.set([1, 2, 4]); // Different - emit
      store.items.set([1, 2, 4]); // Same - no emit
      store.items.set([1, 2]);    // Different length - emit
      
      expect(emissions.length).toBe(3); // initial + 2 different
      expect(emissions).toEqual([
        [1, 2, 3],
        [1, 2, 4],
        [1, 2],
      ]);
    });

    test('emits for objects with different references even if structurally equal', () => {
      const store = state({ items: array([{ id: 1 }], { distinct: 'shallow' }) });
      const emissions: { id: number }[][] = [];
      
      store.items.subscribe(v => emissions.push([...v]));
      
      // Different object reference - will emit because shallow uses ===
      store.items.set([{ id: 1 }]);
      
      expect(emissions.length).toBe(2); // Shallow doesn't compare object contents
    });

    test('does not emit for same object references', () => {
      const obj = { id: 1 };
      const store = state({ items: array([obj], { distinct: 'shallow' }) });
      const emissions: { id: number }[][] = [];
      
      store.items.subscribe(v => emissions.push([...v]));
      
      store.items.set([obj]); // Same reference - no emit
      
      expect(emissions.length).toBe(1);
    });

    test('works with strings', () => {
      const store = state({ tags: array(['a', 'b', 'c'], { distinct: 'shallow' }) });
      const emissions: string[][] = [];
      
      store.tags.subscribe(v => emissions.push([...v]));
      
      store.tags.set(['a', 'b', 'c']); // Same - no emit
      store.tags.set(['a', 'b', 'd']); // Different - emit
      
      expect(emissions.length).toBe(2);
    });
  });

  describe("distinct: 'deep'", () => {
    test('does not emit when setting structurally equal objects', () => {
      const store = state({ items: array([{ id: 1, name: 'Alice' }], { distinct: 'deep' }) });
      const emissions: { id: number; name: string }[][] = [];
      
      store.items.subscribe(v => emissions.push([...v]));
      
      store.items.set([{ id: 1, name: 'Alice' }]); // Same structure - no emit
      store.items.set([{ id: 1, name: 'Alice' }]); // Same structure - no emit
      
      expect(emissions.length).toBe(1); // Only initial
    });

    test('emits when object structure differs', () => {
      const store = state({ items: array([{ id: 1 }], { distinct: 'deep' }) });
      const emissions: { id: number }[][] = [];
      
      store.items.subscribe(v => emissions.push([...v]));
      
      store.items.set([{ id: 1 }]); // Same - no emit
      store.items.set([{ id: 2 }]); // Different - emit
      store.items.set([{ id: 2 }]); // Same - no emit
      
      expect(emissions.length).toBe(2);
    });

    test('works with nested objects', () => {
      const store = state({ 
        items: array([{ user: { name: 'Alice', age: 30 } }], { distinct: 'deep' }) 
      });
      const emissions: unknown[] = [];
      
      store.items.subscribe(v => emissions.push(v));
      
      store.items.set([{ user: { name: 'Alice', age: 30 } }]); // Same - no emit
      store.items.set([{ user: { name: 'Alice', age: 31 } }]); // Different - emit
      
      expect(emissions.length).toBe(2);
    });

    test('works with arrays of primitives', () => {
      const store = state({ items: array([1, 2, 3], { distinct: 'deep' }) });
      const emissions: number[][] = [];
      
      store.items.subscribe(v => emissions.push([...v]));
      
      store.items.set([1, 2, 3]); // Same - no emit
      store.items.set([1, 2, 4]); // Different - emit
      
      expect(emissions.length).toBe(2);
    });
  });

  describe('distinct: custom function', () => {
    test('uses custom comparator for equality', () => {
      const store = state({ 
        users: array([{ id: 1, name: 'Alice', updatedAt: 100 }], { 
          distinct: (a, b) => 
            a.length === b.length && 
            a.every((user, i) => user.id === b[i].id)
        }) 
      });
      const emissions: { id: number; name: string; updatedAt: number }[][] = [];
      
      store.users.subscribe(v => emissions.push([...v]));
      
      // Same id, different name - no emit (custom comparator only checks id)
      store.users.set([{ id: 1, name: 'Bob', updatedAt: 200 }]);
      
      // Different id - emit
      store.users.set([{ id: 2, name: 'Charlie', updatedAt: 300 }]);
      
      expect(emissions.length).toBe(2); // initial + 1 (different id)
      expect(emissions[0][0].id).toBe(1);
      expect(emissions[1][0].id).toBe(2);
    });

    test('custom comparator receives both arrays', () => {
      let comparatorCalls: [unknown[], unknown[]][] = [];
      
      const store = state({ 
        items: array([1, 2], { 
          distinct: (a, b) => {
            comparatorCalls.push([a, b]);
            return a.length === b.length;
          }
        }) 
      });
      
      store.items.subscribe(() => {});
      
      store.items.set([3, 4]); // Same length - no emit
      store.items.set([5, 6, 7]); // Different length - emit
      
      expect(comparatorCalls.length).toBe(2);
      // First comparison: [1,2] vs [3,4]
      expect(comparatorCalls[0][0]).toEqual([1, 2]);
      expect(comparatorCalls[0][1]).toEqual([3, 4]);
    });
  });

  describe('array operations with distinct', () => {
    test('push still triggers emission', () => {
      const store = state({ items: array([1, 2], { distinct: 'shallow' }) });
      const emissions: number[][] = [];
      
      store.items.subscribe(v => emissions.push([...v]));
      
      store.items.push(3);
      
      expect(emissions.length).toBe(2);
      expect(emissions[1]).toEqual([1, 2, 3]);
    });

    test('pop still triggers emission', () => {
      const store = state({ items: array([1, 2, 3], { distinct: 'shallow' }) });
      const emissions: number[][] = [];
      
      store.items.subscribe(v => emissions.push([...v]));
      
      store.items.pop();
      
      expect(emissions.length).toBe(2);
      expect(emissions[1]).toEqual([1, 2]);
    });

    test('at() still works', () => {
      const store = state({ items: array([1, 2, 3], { distinct: 'shallow' }) });
      
      expect(store.items.at(0)?.get()).toBe(1);
      expect(store.items.at(1)?.get()).toBe(2);
    });

    test('get() returns current value', () => {
      const store = state({ items: array([1, 2, 3], { distinct: 'shallow' }) });
      
      expect(store.items.get()).toEqual([1, 2, 3]);
      
      store.items.set([4, 5, 6]);
      
      expect(store.items.get()).toEqual([4, 5, 6]);
    });
  });
});
