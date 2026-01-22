/**
 * Basic get/set operations for state
 */

import { describe, test, expect } from 'bun:test';
import { state } from '../src';

describe('state basic operations', () => {
  test('should get initial primitive values', () => {
    const store = state({
      name: 'Alice',
      age: 30,
      active: true,
    });

    expect(store.name.get()).toBe('Alice');
    expect(store.age.get()).toBe(30);
    expect(store.active.get()).toBe(true);
  });

  test('should get initial nested values', () => {
    const store = state({
      user: { name: 'Alice', age: 30 },
      settings: { theme: 'dark' },
    });

    expect(store.user.name.get()).toBe('Alice');
    expect(store.user.age.get()).toBe(30);
    expect(store.settings.theme.get()).toBe('dark');
  });

  test('should set primitive values', () => {
    const store = state({
      name: 'Alice',
      count: 0,
    });

    store.name.set('Bob');
    store.count.set(42);

    expect(store.name.get()).toBe('Bob');
    expect(store.count.get()).toBe(42);
  });

  test('should set nested values', () => {
    const store = state({
      user: { name: 'Alice', age: 30 },
    });

    store.user.name.set('Bob');
    store.user.age.set(31);

    expect(store.user.name.get()).toBe('Bob');
    expect(store.user.age.get()).toBe(31);
  });

  test('should get full nested object', () => {
    const store = state({
      user: { name: 'Alice', age: 30 },
    });

    expect(store.user.get()).toEqual({ name: 'Alice', age: 30 });
  });

  test('should replace entire nested object', () => {
    const store = state({
      user: { name: 'Alice', profile: { bio: 'Hello' } },
    });

    store.user.set({ name: 'Bob', profile: { bio: 'World' } });

    expect(store.user.get()).toEqual({ name: 'Bob', profile: { bio: 'World' } });
    expect(store.user.name.get()).toBe('Bob');
    expect(store.user.profile.bio.get()).toBe('World');
  });

  test('should handle deeply nested access (4+ levels)', () => {
    const store = state({
      level1: {
        level2: {
          level3: {
            level4: {
              value: 'deep',
            },
          },
        },
      },
    });

    expect(store.level1.level2.level3.level4.value.get()).toBe('deep');

    store.level1.level2.level3.level4.value.set('deeper');

    expect(store.level1.level2.level3.level4.value.get()).toBe('deeper');
  });

  test('should return mutable snapshots', () => {
    const store = state({
      user: { name: 'Alice' },
    });

    let snapshotValue: { name: string } | undefined;
    store.user.subscribe((user) => {
      snapshotValue = user;
    });

    snapshotValue!.name = 'Hacked';

    expect(store.user.name.get()).toBe('Alice');
  });
});
