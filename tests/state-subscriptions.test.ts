/**
 * Subscription behavior tests
 */

import { describe, test, expect } from 'bun:test';
import { state } from '../src/deepstate-v2';

describe('subscriptions', () => {
  describe('basic subscription', () => {
    test('should emit current value on subscribe', () => {
      const store = state({ value: 'initial' });
      const emissions: string[] = [];

      store.value.subscribe((v) => emissions.push(v));

      expect(emissions).toEqual(['initial']);
    });

    test('should emit on value changes', () => {
      const store = state({ value: 'initial' });
      const emissions: string[] = [];

      store.value.subscribe((v) => emissions.push(v));
      store.value.set('changed');

      expect(emissions).toEqual(['initial', 'changed']);
    });

    test('should stop emitting after unsubscribe', () => {
      const store = state({ value: 'initial' });
      const emissions: string[] = [];

      const sub = store.value.subscribe((v) => emissions.push(v));
      store.value.set('first');
      sub.unsubscribe();
      store.value.set('second');

      expect(emissions).toEqual(['initial', 'first']);
    });
  });

  describe('subscribeOnce', () => {
    test('should only emit once', () => {
      const store = state({ value: 'initial' });
      let callCount = 0;

      store.value.subscribeOnce(() => callCount++);
      store.value.set('changed');
      store.value.set('changed again');

      expect(callCount).toBe(1);
    });

    test('should receive current value', () => {
      const store = state({ value: 'initial' });
      let received: string | undefined;

      store.value.subscribeOnce((v) => {
        received = v;
      });

      expect(received).toBe('initial');
    });
  });

  describe('sibling isolation (critical feature)', () => {
    test('siblings should NOT emit when one changes', () => {
      const store = state({
        user: { name: 'Alice', age: 30 },
        settings: { theme: 'dark' },
      });

      let nameEmits = 0;
      let ageEmits = 0;
      let themeEmits = 0;

      store.user.name.subscribe(() => nameEmits++);
      store.user.age.subscribe(() => ageEmits++);
      store.settings.theme.subscribe(() => themeEmits++);

      // Reset after initial emission
      nameEmits = 0;
      ageEmits = 0;
      themeEmits = 0;

      // Change only name
      store.user.name.set('Bob');

      expect(nameEmits).toBe(1);
      expect(ageEmits).toBe(0);
      expect(themeEmits).toBe(0);
    });

    test('multiple changes to same field should emit each time', () => {
      const store = state({ value: 'a' });
      const emissions: string[] = [];

      store.value.subscribe((v) => emissions.push(v));
      store.value.set('b');
      store.value.set('c');

      expect(emissions).toEqual(['a', 'b', 'c']);
    });
  });

  describe('parent emissions', () => {
    test('parent should emit when child changes', () => {
      const store = state({
        user: { name: 'Alice', age: 30 },
      });

      let userEmits = 0;
      let lastUserValue: unknown;

      store.user.subscribe((value) => {
        userEmits++;
        lastUserValue = value;
      });

      // Reset after initial
      userEmits = 0;

      store.user.name.set('Bob');

      expect(userEmits).toBe(1);
      expect(lastUserValue).toEqual({ name: 'Bob', age: 30 });
    });

    test('parent should emit when deeply nested child changes', () => {
      const store = state({
        user: { profile: { bio: 'Hello' } },
      });

      let emissions = 0;
      store.user.subscribe(() => emissions++);

      // Reset after initial
      emissions = 0;

      store.user.profile.bio.set('World');

      expect(emissions).toBe(1);
    });

    test('replacing parent should emit to child subscribers', () => {
      const store = state({
        user: { name: 'Alice', profile: { bio: 'Hello' } },
      });

      let profileEmissions = 0;
      store.user.profile.subscribe(() => profileEmissions++);

      // Reset after initial
      profileEmissions = 0;

      store.user.set({ name: 'Bob', profile: { bio: 'World' } });

      expect(profileEmissions).toBe(1);
    });
  });
});
