/**
 * Minimal tests for deepstate-react hooks without @testing-library/react.
 * This avoids the DOM/jsdom complexity.
 */
import { describe, test, expect } from "bun:test";
import { state } from "deepstate";
import { BehaviorSubject } from "rxjs";

// Test the hooks logic directly without React rendering
describe("hooks logic (unit tests)", () => {
  test("deepstate node has get() method", () => {
    const store = state({ count: 42 });
    expect(store.count.get()).toBe(42);
  });

  test("deepstate node is subscribable", () => {
    const store = state({ count: 0 });
    const values: number[] = [];
    
    const sub = store.count.subscribe(v => values.push(v));
    store.count.set(1);
    store.count.set(2);
    sub.unsubscribe();
    
    expect(values).toEqual([0, 1, 2]);
  });

  test("nested objects work", () => {
    const store = state({ user: { name: "Alice" } });
    expect(store.user.name.get()).toBe("Alice");
    
    store.user.name.set("Bob");
    expect(store.user.name.get()).toBe("Bob");
  });

  test("arrays work", () => {
    const store = state({ items: [1, 2, 3] });
    expect(store.items.get()).toEqual([1, 2, 3]);
    
    store.items.push(4);
    expect(store.items.get()).toEqual([1, 2, 3, 4]);
  });

  test("batched updates work", () => {
    const store = state({ user: { name: "Alice", age: 30 } });
    const values: Array<{ name: string; age: number }> = [];
    
    store.user.subscribe(v => values.push({ ...v }));
    
    store.user.update(u => {
      u.name.set("Bob");
      u.age.set(31);
    });
    
    // Should have initial + 1 batched update
    expect(values.length).toBe(2);
    expect(values[1]).toEqual({ name: "Bob", age: 31 });
  });
});

describe("BehaviorSubject (rxjs integration)", () => {
  test("BehaviorSubject has getValue()", () => {
    const subject$ = new BehaviorSubject(42);
    expect(subject$.getValue()).toBe(42);
  });

  test("BehaviorSubject is subscribable", () => {
    const subject$ = new BehaviorSubject(0);
    const values: number[] = [];
    
    const sub = subject$.subscribe(v => values.push(v));
    subject$.next(1);
    subject$.next(2);
    sub.unsubscribe();
    
    expect(values).toEqual([0, 1, 2]);
  });
});

describe("multi-node selection (combineLatest pattern)", () => {
  test("combining multiple nodes with array form", () => {
    const store = state({ completed: 3, total: 10 });
    
    // Simulate what useSelect does internally with array form
    const { combineLatest } = require("rxjs");
    const { map } = require("rxjs/operators");
    
    const combined$ = combineLatest([store.completed, store.total]).pipe(
      map(([completed, total]: [number, number]) => 
        total > 0 ? (completed / total) * 100 : 0
      )
    );
    
    const values: number[] = [];
    const sub = combined$.subscribe((v: number) => values.push(v));
    
    expect(values).toEqual([30]); // initial: 3/10 * 100 = 30
    
    store.completed.set(5);
    expect(values).toEqual([30, 50]); // 5/10 * 100 = 50
    
    store.total.set(20);
    expect(values).toEqual([30, 50, 25]); // 5/20 * 100 = 25
    
    sub.unsubscribe();
  });

  test("combining multiple nodes with object form", () => {
    const store = state({ completed: 3, total: 10 });
    
    const { combineLatest } = require("rxjs");
    const { map } = require("rxjs/operators");
    
    const keys = ["completed", "total"];
    const observables = [store.completed, store.total];
    
    const combined$ = combineLatest(observables).pipe(
      map((vals: unknown[]) => {
        const result: Record<string, unknown> = {};
        keys.forEach((key, i) => { result[key] = vals[i]; });
        return result;
      }),
      map(({ completed, total }: { completed: number; total: number }) =>
        total > 0 ? (completed / total) * 100 : 0
      )
    );
    
    const values: number[] = [];
    const sub = combined$.subscribe((v: number) => values.push(v));
    
    expect(values).toEqual([30]);
    
    store.completed.set(7);
    expect(values).toEqual([30, 70]);
    
    sub.unsubscribe();
  });
});
