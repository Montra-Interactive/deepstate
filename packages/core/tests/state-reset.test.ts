/**
 * Tests for the `.reset()` method on a root store.
 */

import { describe, test, expect } from 'bun:test';
import { array, nullable, state } from '../src';

describe('store.reset()', () => {
  test('restores primitive fields to their initial values', () => {
    const store = state({ name: 'Alice', age: 30, active: true });

    store.name.set('Bob');
    store.age.set(99);
    store.active.set(false);

    store.reset();

    expect(store.name.get()).toBe('Alice');
    expect(store.age.get()).toBe(30);
    expect(store.active.get()).toBe(true);
  });

  test('restores nested object fields', () => {
    const store = state({
      user: { name: 'Alice', profile: { bio: 'Hello' } },
    });

    store.user.name.set('Bob');
    store.user.profile.bio.set('Changed');

    store.reset();

    expect(store.user.name.get()).toBe('Alice');
    expect(store.user.profile.bio.get()).toBe('Hello');
  });

  test('restores arrays', () => {
    const store = state({
      items: [{ id: 1, name: 'a' }, { id: 2, name: 'b' }],
    });

    store.items.push({ id: 3, name: 'c' });
    store.items.at(0)?.name.set('changed');

    store.reset();

    expect(store.items.get()).toEqual([
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
    ]);
  });

  test('restores arrays with distinct config; distinct still applies after reset', () => {
    const store = state({
      items: array<number>([1, 2, 3], { distinct: 'deep' }),
    });

    store.items.set([9, 9, 9]);
    store.reset();
    expect(store.items.get()).toEqual([1, 2, 3]);

    // Setting the same deep-equal array after reset should be deduped.
    let emissions = 0;
    const sub = store.items.subscribe(() => {
      emissions++;
    });
    // initial subscription replay counts as one
    store.items.set([1, 2, 3]);

    expect(emissions).toBe(1);
    sub.unsubscribe();
  });

  test('restores a nullable object that started null', () => {
    type State = { user: { name: string; age: number } | null };
    const store = state<State>({ user: null });

    store.user.set({ name: 'Alice', age: 30 });
    expect(store.user.get()).toEqual({ name: 'Alice', age: 30 });

    store.reset();

    expect(store.user.get()).toBeNull();
  });

  test('restores a nullable object that started with a value', () => {
    const store = state({
      user: nullable({ name: 'Alice', age: 30 }),
    });

    store.user.set(null);
    expect(store.user.get()).toBeNull();

    store.reset();

    expect(store.user.get()).toEqual({ name: 'Alice', age: 30 });
  });

  test('mutating snapshots returned from .get() cannot corrupt later resets', () => {
    const store = state({
      items: [1, 2, 3],
      config: { flag: true },
    });

    const snapshot = store.get();
    (snapshot.items as number[]).push(999);
    snapshot.config.flag = false;

    store.reset();

    expect(store.items.get()).toEqual([1, 2, 3]);
    expect(store.config.flag.get()).toBe(true);
  });

  test('mutating the original initial-state reference does not affect reset', () => {
    const initial = { items: [1, 2, 3] };
    const store = state(initial);

    initial.items.push(999);

    store.items.set([42]);
    store.reset();

    expect(store.items.get()).toEqual([1, 2, 3]);
  });

  test('reset is idempotent', () => {
    const store = state({ count: 0 });
    store.count.set(5);
    store.reset();
    store.reset();
    expect(store.count.get()).toBe(0);
  });

  test('notifies subscribers when reset changes values', () => {
    const store = state({ count: 0 });

    const values: number[] = [];
    const sub = store.count.subscribe((v) => {
      values.push(v);
    });

    store.count.set(5);
    store.reset();

    expect(values).toEqual([0, 5, 0]);
    sub.unsubscribe();
  });

  test('no-op reset does not emit on a primitive when already at initial', () => {
    const store = state({ count: 0 });

    const values: number[] = [];
    const sub = store.count.subscribe((v) => {
      values.push(v);
    });

    store.reset();

    // distinctUntilChanged on the leaf should dedup the replayed value.
    expect(values).toEqual([0]);
    sub.unsubscribe();
  });

  test('resets empty-array state cleanly', () => {
    const store = state({ items: [] as number[] });
    store.items.push(1, 2, 3);
    store.reset();
    expect(store.items.get()).toEqual([]);
  });
});
