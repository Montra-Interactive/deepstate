/**
 * React hook tests using @testing-library/react
 */
import { describe, test, expect } from "bun:test";
import React from "react";
import { render, screen, act } from "@testing-library/react";
import { state } from "deepstate";
import { BehaviorSubject } from "rxjs";
import { useSelect, useObservable } from "../src";

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
