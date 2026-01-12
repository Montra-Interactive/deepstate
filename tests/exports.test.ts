/**
 * Tests that exports work correctly
 */

import { describe, test, expect } from 'bun:test';
import { state, stateV1, select, selectFromEach } from '../src';

describe('exports', () => {
  describe('state (v2 default)', () => {
    test('should export state function', () => {
      expect(typeof state).toBe('function');
    });

    test('should create working v2 store', () => {
      const store = state({ name: 'Alice', count: 0 });

      expect(store.name.get()).toBe('Alice');

      store.name.set('Bob');

      expect(store.name.get()).toBe('Bob');
    });
  });

  describe('stateV1', () => {
    test('should export stateV1 function', () => {
      expect(typeof stateV1).toBe('function');
    });

    test('should create working v1 store', () => {
      const store = stateV1({ name: 'Charlie', count: 0 });

      expect(store.name.get()).toBe('Charlie');

      store.name.set('Diana');

      expect(store.name.get()).toBe('Diana');
    });
  });

  describe('helpers', () => {
    test('should export select function', () => {
      expect(typeof select).toBe('function');
    });

    test('should export selectFromEach function', () => {
      expect(typeof selectFromEach).toBe('function');
    });

    test('select should work with v2 state', () => {
      const store = state({ a: 1, b: 2 });
      const emissions: [number, number][] = [];

      select(store.a, store.b).subscribe(([a, b]) => {
        emissions.push([a, b]);
      });

      expect(emissions).toEqual([[1, 2]]);
    });
  });
});
