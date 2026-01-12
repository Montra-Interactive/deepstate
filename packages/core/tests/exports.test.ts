/**
 * Tests that exports work correctly
 */

import { describe, test, expect } from 'bun:test';
import { state, nullable, select, selectFromEach } from '../src';

describe('exports', () => {
  describe('state', () => {
    test('should export state function', () => {
      expect(typeof state).toBe('function');
    });

    test('should create working store', () => {
      const store = state({ name: 'Alice', count: 0 });

      expect(store.name.get()).toBe('Alice');

      store.name.set('Bob');

      expect(store.name.get()).toBe('Bob');
    });
  });

  describe('nullable', () => {
    test('should export nullable function', () => {
      expect(typeof nullable).toBe('function');
    });
  });

  describe('helpers', () => {
    test('should export select function', () => {
      expect(typeof select).toBe('function');
    });

    test('should export selectFromEach function', () => {
      expect(typeof selectFromEach).toBe('function');
    });

    test('select should work with state', () => {
      const store = state({ a: 1, b: 2 });
      const emissions: [number, number][] = [];

      select(store.a, store.b).subscribe(([a, b]) => {
        emissions.push([a, b]);
      });

      expect(emissions).toEqual([[1, 2]]);
    });
  });
});
