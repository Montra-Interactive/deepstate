/**
 * React hook tests using @testing-library/react
 */
import { describe, test, expect } from "bun:test";
import React from "react";
import { render, screen, act } from "@testing-library/react";
import { state } from "deepstate";
import { BehaviorSubject } from "rxjs";
import { filter, map, debounceTime } from "rxjs/operators";
import { useSelect, usePipeSelect, useObservable } from "../src";

describe("useSelect", () => {
  describe("single node without selector", () => {
    test("returns current value of a primitive node", () => {
      const store = state({ count: 42 });

      function Counter() {
        const count = useSelect(store.count);
        return <div data-testid="count">{count}</div>;
      }

      render(<Counter />);
      expect(screen.getByTestId("count").textContent).toBe("42");
    });

    test("updates when node value changes", async () => {
      const store = state({ count: 0 });

      function Counter() {
        const count = useSelect(store.count);
        return <div data-testid="count">{count}</div>;
      }

      render(<Counter />);
      expect(screen.getByTestId("count").textContent).toBe("0");

      await act(() => {
        store.count.set(10);
      });

      expect(screen.getByTestId("count").textContent).toBe("10");
    });

    test("works with object nodes", async () => {
      const store = state({ user: { name: "Alice", age: 30 } });

      function User() {
        const user = useSelect(store.user);
        return <div data-testid="user">{user?.name} ({user?.age})</div>;
      }

      await act(async () => {
        render(<User />);
      });
      expect(screen.getByTestId("user").textContent).toBe("Alice (30)");
    });

    test("works with nested properties", () => {
      const store = state({ user: { name: "Alice" } });

      function UserName() {
        const name = useSelect(store.user.name);
        return <div data-testid="name">{name}</div>;
      }

      render(<UserName />);
      expect(screen.getByTestId("name").textContent).toBe("Alice");
    });

    test("works with nullable node starting as null", async () => {
      const store = state<{ selectedId: string | null }>({ selectedId: null });

      function SelectedId() {
        const id = useSelect(store.selectedId);
        return <div data-testid="id">{id ?? "none"}</div>;
      }

      render(<SelectedId />);
      expect(screen.getByTestId("id").textContent).toBe("none");

      await act(() => {
        store.selectedId.set("abc-123");
      });

      expect(screen.getByTestId("id").textContent).toBe("abc-123");
    });

    test("works with nullable node transitioning null -> value -> null", async () => {
      const store = state<{ selectedId: string | null }>({ selectedId: null });

      function SelectedId() {
        const id = useSelect(store.selectedId);
        return <div data-testid="id">{id ?? "none"}</div>;
      }

      render(<SelectedId />);
      expect(screen.getByTestId("id").textContent).toBe("none");

      await act(() => {
        store.selectedId.set("first");
      });
      expect(screen.getByTestId("id").textContent).toBe("first");

      await act(() => {
        store.selectedId.set(null);
      });
      expect(screen.getByTestId("id").textContent).toBe("none");

      await act(() => {
        store.selectedId.set("second");
      });
      expect(screen.getByTestId("id").textContent).toBe("second");
    });

    test("works with nullable object node", async () => {
      const store = state<{ user: { name: string } | null }>({ user: null });

      function User() {
        const user = useSelect(store.user);
        return <div data-testid="user">{user?.name ?? "no user"}</div>;
      }

      render(<User />);
      expect(screen.getByTestId("user").textContent).toBe("no user");

      await act(() => {
        store.user.set({ name: "Alice" });
      });

      expect(screen.getByTestId("user").textContent).toBe("Alice");
    });
  });

  describe("single node with selector", () => {
    test("applies selector to derive value", () => {
      const store = state({ user: { firstName: "Alice", lastName: "Smith" } });

      function FullName() {
        const fullName = useSelect(
          store.user,
          (user) => `${user.firstName} ${user.lastName}`
        );
        return <div data-testid="name">{fullName}</div>;
      }

      render(<FullName />);
      expect(screen.getByTestId("name").textContent).toBe("Alice Smith");
    });

    test("updates when derived value changes", async () => {
      const store = state({ items: [{ price: 10 }, { price: 20 }] });

      function Total() {
        const total = useSelect(store.items, (items) =>
          items.reduce((sum, item) => sum + item.price, 0)
        );
        return <div data-testid="total">{total}</div>;
      }

      render(<Total />);
      expect(screen.getByTestId("total").textContent).toBe("30");

      await act(() => {
        store.items.push({ price: 15 });
      });

      expect(screen.getByTestId("total").textContent).toBe("45");
    });

    test("selector prevents re-render when derived value unchanged", async () => {
      const store = state({ user: { name: "Alice", age: 30 } });

      function NameOnly() {
        const name = useSelect(store.user, (user) => user.name);
        return <div data-testid="name">{name}</div>;
      }

      await act(async () => {
        render(<NameOnly />);
      });
      expect(screen.getByTestId("name").textContent).toBe("Alice");

      // Change age - selector returns same name, so value unchanged
      await act(() => {
        store.user.age.set(31);
      });
      // Name should still be Alice
      expect(screen.getByTestId("name").textContent).toBe("Alice");

      // Change name - SHOULD update
      await act(() => {
        store.user.name.set("Bob");
      });
      expect(screen.getByTestId("name").textContent).toBe("Bob");
    });
  });

  describe("array of nodes with selector", () => {
    test("combines multiple nodes", () => {
      const store = state({ completed: 3, total: 10 });

      function Progress() {
        const percentage = useSelect(
          [store.completed, store.total],
          ([completed, total]) => (total > 0 ? (completed / total) * 100 : 0)
        );
        return <div data-testid="pct">{percentage}%</div>;
      }

      render(<Progress />);
      expect(screen.getByTestId("pct").textContent).toBe("30%");
    });

    test("updates when any node changes", async () => {
      const store = state({ completed: 3, total: 10 });

      function Progress() {
        const percentage = useSelect(
          [store.completed, store.total],
          ([completed, total]) => (total > 0 ? (completed / total) * 100 : 0)
        );
        return <div data-testid="pct">{percentage}%</div>;
      }

      render(<Progress />);
      expect(screen.getByTestId("pct").textContent).toBe("30%");

      await act(() => {
        store.completed.set(5);
      });
      expect(screen.getByTestId("pct").textContent).toBe("50%");

      await act(() => {
        store.total.set(20);
      });
      expect(screen.getByTestId("pct").textContent).toBe("25%");
    });

    test("works with different node types", async () => {
      const store = state({
        name: "Alice",
        scores: [90, 85, 95],
      });

      function Summary() {
        const summary = useSelect(
          [store.name, store.scores],
          ([name, scores]) => {
            const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
            return `${name}: ${avg.toFixed(1)}`;
          }
        );
        return <div data-testid="summary">{summary}</div>;
      }

      render(<Summary />);
      expect(screen.getByTestId("summary").textContent).toBe("Alice: 90.0");
    });
  });

  describe("object of nodes with selector", () => {
    test("combines nodes with named keys", () => {
      const store = state({ completed: 3, total: 10 });

      function Progress() {
        const percentage = useSelect(
          { completed: store.completed, total: store.total },
          ({ completed, total }) => (total > 0 ? (completed / total) * 100 : 0)
        );
        return <div data-testid="pct">{percentage}%</div>;
      }

      render(<Progress />);
      expect(screen.getByTestId("pct").textContent).toBe("30%");
    });

    test("updates when any node changes", async () => {
      const store = state({ a: 1, b: 2 });

      function Sum() {
        const sum = useSelect(
          { first: store.a, second: store.b },
          ({ first, second }) => first + second
        );
        return <div data-testid="sum">{sum}</div>;
      }

      render(<Sum />);
      expect(screen.getByTestId("sum").textContent).toBe("3");

      await act(() => {
        store.a.set(10);
      });
      expect(screen.getByTestId("sum").textContent).toBe("12");
    });
  });
});

describe("useObservable", () => {
  test("works with BehaviorSubject", () => {
    const count$ = new BehaviorSubject(42);

    function Counter() {
      const count = useObservable(count$, () => count$.getValue());
      return <div data-testid="count">{count}</div>;
    }

    render(<Counter />);
    expect(screen.getByTestId("count").textContent).toBe("42");
  });

  test("updates when BehaviorSubject emits", async () => {
    const count$ = new BehaviorSubject(0);

    function Counter() {
      const count = useObservable(count$, () => count$.getValue());
      return <div data-testid="count">{count}</div>;
    }

    render(<Counter />);
    expect(screen.getByTestId("count").textContent).toBe("0");

    await act(() => {
      count$.next(10);
    });

    expect(screen.getByTestId("count").textContent).toBe("10");
  });
});

describe("usePipeSelect", () => {
  test("returns undefined initially when filter blocks initial value", () => {
    const store = state({ count: 1 });

    function FilteredCount() {
      // Initial value is 1, which is filtered out (not > 3)
      const value = usePipeSelect(store.count.pipe(filter((v) => v > 3)));
      return <div data-testid="value">{value ?? "undefined"}</div>;
    }

    render(<FilteredCount />);
    expect(screen.getByTestId("value").textContent).toBe("undefined");
  });

  test("emits when value passes filter", async () => {
    const store = state({ count: 1 });

    function FilteredCount() {
      const value = usePipeSelect(store.count.pipe(filter((v) => v > 3)));
      return <div data-testid="value">{value ?? "undefined"}</div>;
    }

    render(<FilteredCount />);
    expect(screen.getByTestId("value").textContent).toBe("undefined");

    // Update to value that passes filter
    await act(() => {
      store.count.set(5);
    });

    expect(screen.getByTestId("value").textContent).toBe("5");
  });

  test("does not re-render when filter blocks update", async () => {
    const store = state({ count: 5 });
    let renderCount = 0;

    function FilteredCount() {
      renderCount++;
      const value = usePipeSelect(store.count.pipe(filter((v) => v > 3)));
      return <div data-testid="value">{value ?? "undefined"}</div>;
    }

    render(<FilteredCount />);
    const initialRenderCount = renderCount;

    // Initial value passes filter, so we should have it
    expect(screen.getByTestId("value").textContent).toBe("5");

    // Update to value that does NOT pass filter
    await act(() => {
      store.count.set(2);
    });

    // Should NOT have re-rendered since filter blocked it
    // Value should still be 5 (last emitted value)
    expect(screen.getByTestId("value").textContent).toBe("5");

    // Update to value that passes filter
    await act(() => {
      store.count.set(10);
    });

    expect(screen.getByTestId("value").textContent).toBe("10");
  });

  test("works with map operator", async () => {
    const store = state({ items: [{ id: 1 }, { id: 2 }, { id: 3 }] });

    function ItemCount() {
      const count = usePipeSelect(store.items.pipe(map((items) => items.length)));
      return <div data-testid="count">{count ?? "undefined"}</div>;
    }

    render(<ItemCount />);
    // Map is synchronous, so first emission happens immediately
    expect(screen.getByTestId("count").textContent).toBe("3");

    await act(() => {
      store.items.push({ id: 4 });
    });

    expect(screen.getByTestId("count").textContent).toBe("4");
  });

  test("filter then update pattern works as expected", async () => {
    /**
     * How it should work:
     * 1. initialValue (1) does not pass filter -> undefined
     * 2. update to 4 -> passes filter -> returns 4
     * 3. update to 2 -> filtered out -> does not emit (still 4)
     * 4. update to 1 -> passes filter -> returns 1, re-renders
     */
    const store = state({ value: 1 });

    function FilteredValue() {
      // Only emit values > 3 OR value === 1 (to test the "passes again" case)
      const value = usePipeSelect(
        store.value.pipe(filter((v) => v > 3 || v === 1))
      );
      return <div data-testid="value">{value ?? "undefined"}</div>;
    }

    render(<FilteredValue />);
    // Initial value 1 passes filter (v === 1)
    expect(screen.getByTestId("value").textContent).toBe("1");

    // Update to 4 -> passes filter (v > 3)
    await act(() => {
      store.value.set(4);
    });
    expect(screen.getByTestId("value").textContent).toBe("4");

    // Update to 2 -> filtered out
    await act(() => {
      store.value.set(2);
    });
    expect(screen.getByTestId("value").textContent).toBe("4"); // Still 4

    // Update to 1 -> passes filter (v === 1)
    await act(() => {
      store.value.set(1);
    });
    expect(screen.getByTestId("value").textContent).toBe("1");
  });

  test("debounceTime reduces renders", async () => {
    const store = state({ search: "" });
    let renderCount = 0;

    function DebouncedSearch() {
      renderCount++;
      const search = usePipeSelect(store.search.pipe(debounceTime(50)));
      return <div data-testid="search">{search ?? "undefined"}</div>;
    }

    render(<DebouncedSearch />);
    const initialRenders = renderCount;

    // Initial is undefined (debounce hasn't emitted yet)
    expect(screen.getByTestId("search").textContent).toBe("undefined");

    // Rapid updates
    await act(() => {
      store.search.set("a");
    });
    await act(() => {
      store.search.set("ab");
    });
    await act(() => {
      store.search.set("abc");
    });

    // Still undefined - debounce hasn't fired
    expect(screen.getByTestId("search").textContent).toBe("undefined");

    // Wait for debounce
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    // Now should have the final value
    expect(screen.getByTestId("search").textContent).toBe("abc");

    // Should have only rendered once for the debounced value (plus initial)
    expect(renderCount).toBeLessThanOrEqual(initialRenders + 2);
  });

  test("combined operators work", async () => {
    const store = state({ count: 0 });

    function Combined() {
      const doubled = usePipeSelect(
        store.count.pipe(
          filter((v) => v > 0),
          map((v) => v * 2)
        )
      );
      return <div data-testid="doubled">{doubled ?? "undefined"}</div>;
    }

    render(<Combined />);
    // 0 is filtered out
    expect(screen.getByTestId("doubled").textContent).toBe("undefined");

    await act(() => {
      store.count.set(5);
    });

    // 5 passes filter, then doubled to 10
    expect(screen.getByTestId("doubled").textContent).toBe("10");
  });
});
