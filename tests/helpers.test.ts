/**
 * Tests for helper functions with V2 state
 */

import { describe, test, expect } from 'bun:test';
import { state } from '../src/deepstate-v2';
import { select, selectFromEach } from '../src/helpers';

describe('helpers', () => {
  describe('select()', () => {
    describe('object form', () => {
      test('should emit combined values on subscribe', () => {
        const store = state({
          user: { name: 'Alice', age: 30 },
          settings: { theme: 'dark' },
        });

        const emissions: { name: string; theme: string }[] = [];

        select({
          name: store.user.name,
          theme: store.settings.theme,
        }).subscribe((value) => {
          emissions.push(value);
        });

        expect(emissions).toHaveLength(1);
        expect(emissions[0]).toEqual({ name: 'Alice', theme: 'dark' });
      });

      test('should emit when any selected value changes', () => {
        const store = state({
          user: { name: 'Alice', age: 30 },
          settings: { theme: 'dark' },
        });

        const emissions: { name: string; theme: string }[] = [];

        select({
          name: store.user.name,
          theme: store.settings.theme,
        }).subscribe((value) => {
          emissions.push(value);
        });

        store.user.name.set('Bob');
        store.settings.theme.set('light');

        expect(emissions).toHaveLength(3);
        expect(emissions[0]).toEqual({ name: 'Alice', theme: 'dark' });
        expect(emissions[1]).toEqual({ name: 'Bob', theme: 'dark' });
        expect(emissions[2]).toEqual({ name: 'Bob', theme: 'light' });
      });
    });

    describe('array form', () => {
      test('should emit tuple of values', () => {
        const store = state({
          a: 1,
          b: 2,
          c: 3,
        });

        const emissions: [number, number][] = [];

        select(store.a, store.c).subscribe((tuple) => {
          emissions.push(tuple as [number, number]);
        });

        expect(emissions).toHaveLength(1);
        expect(emissions[0]).toEqual([1, 3]);
      });

      test('should only emit when selected values change', () => {
        const store = state({
          a: 1,
          b: 2,
          c: 3,
        });

        const emissions: [number, number][] = [];

        select(store.a, store.c).subscribe((tuple) => {
          emissions.push(tuple as [number, number]);
        });

        store.a.set(10);
        store.b.set(20); // Should NOT cause emission since we only selected a and c
        store.c.set(30);

        expect(emissions).toEqual([
          [1, 3],
          [10, 3],
          [10, 30],
        ]);
      });
    });
  });

  describe('selectFromEach()', () => {
    test('should select a property from each array item', () => {
      const store = state({
        items: [
          { id: 1, name: 'A', price: 10 },
          { id: 2, name: 'B', price: 20 },
          { id: 3, name: 'C', price: 30 },
        ],
      });

      const emissions: number[][] = [];

      selectFromEach(store.items, (item) => item.price).subscribe((prices) => {
        emissions.push([...prices]);
      });

      expect(emissions).toHaveLength(1);
      expect(emissions[0]).toEqual([10, 20, 30]);
    });

    test('should emit when selected property changes', () => {
      const store = state({
        items: [
          { id: 1, name: 'A', price: 10 },
          { id: 2, name: 'B', price: 20 },
          { id: 3, name: 'C', price: 30 },
        ],
      });

      const emissions: number[][] = [];

      selectFromEach(store.items, (item) => item.price).subscribe((prices) => {
        emissions.push([...prices]);
      });

      store.items.at(0)?.price.set(15);

      expect(emissions).toEqual([
        [10, 20, 30],
        [15, 20, 30],
      ]);
    });

    test('should NOT emit when non-selected property changes', () => {
      const store = state({
        items: [
          { id: 1, name: 'A', price: 10 },
          { id: 2, name: 'B', price: 20 },
          { id: 3, name: 'C', price: 30 },
        ],
      });

      const emissions: number[][] = [];

      selectFromEach(store.items, (item) => item.price).subscribe((prices) => {
        emissions.push([...prices]);
      });

      // Change name, not price - should NOT trigger emission
      store.items.at(1)?.name.set('Beta');

      expect(emissions).toEqual([[10, 20, 30]]);
    });

    test('should work with derived/computed values', () => {
      const store = state({
        cart: [
          { name: 'Widget', price: 10, qty: 2 },
          { name: 'Gadget', price: 25, qty: 1 },
        ],
      });

      const emissions: { name: string; total: number }[][] = [];

      selectFromEach(store.cart, (item) => ({
        name: item.name,
        total: item.price * item.qty,
      })).subscribe((totals) => {
        emissions.push([...totals]);
      });

      expect(emissions[0]).toEqual([
        { name: 'Widget', total: 20 },
        { name: 'Gadget', total: 25 },
      ]);

      store.cart.at(0)?.qty.set(3); // Should change total from 20 to 30

      expect(emissions[1]).toEqual([
        { name: 'Widget', total: 30 },
        { name: 'Gadget', total: 25 },
      ]);
    });
  });
});
