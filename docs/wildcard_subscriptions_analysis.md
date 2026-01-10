# Wildcard Subscriptions Analysis

Exploring whether wildcard subscriptions (e.g., `items.*.price`) make sense for deepstate.

## What Are Wildcard Subscriptions?

The idea: subscribe to a pattern that matches multiple paths in the state tree.

```ts
// Hypothetical API
myState.items.$each.price.subscribe(prices => {
  // prices = [9.99, 19.99, 29.99] - array of all item prices
});

// Or with a string-based API
myState.select('items.*.price').subscribe(prices => ...);
```

## Use Cases

### 1. Aggregate derived values
```ts
// "Notify me when ANY item's price changes"
myState.items.$each.price.subscribe(prices => {
  const total = prices.reduce((a, b) => a + b, 0);
});
```

### 2. UI list rendering
```ts
// "Give me all item names for rendering"
myState.items.$each.name.subscribe(names => {
  renderList(names);
});
```

### 3. Validation
```ts
// "Check if any item is out of stock"
myState.items.$each.qty.subscribe(quantities => {
  const outOfStock = quantities.some(q => q <= 0);
});
```

## Current Alternatives (Without Wildcards)

### Alternative 1: Subscribe to parent array + map
```ts
myState.items.pipe(
  map(items => items.map(item => item.price))
).subscribe(prices => {
  const total = prices.reduce((a, b) => a + b, 0);
});
```

**Pros:**
- Works today
- Full TypeScript support
- Standard RxJS patterns
- Can add any transformation

**Cons:**
- Emits when ANY property of ANY item changes, not just price
- More verbose

### Alternative 2: Subscribe to array + distinctUntilChanged on derived value
```ts
myState.items.pipe(
  map(items => items.map(item => item.price)),
  distinctUntilChanged((a, b) => a.length === b.length && a.every((v, i) => v === b[i]))
).subscribe(prices => ...);
```

**Pros:**
- Only emits when prices actually change
- Full control over equality

**Cons:**
- Verbose
- Easy to get wrong

### Alternative 3: combineLatest with known indices
```ts
// Only works if you know the indices ahead of time
combineLatest([
  myState.items.at(0)?.price,
  myState.items.at(1)?.price,
  myState.items.at(2)?.price,
].filter(Boolean)).subscribe(prices => ...);
```

**Pros:**
- Only emits when individual prices change

**Cons:**
- Doesn't work for dynamic arrays
- Breaks when items are added/removed

## Implementation Approaches

### Approach A: `$each` / `$all` Symbol Property

```ts
const $each = Symbol('each');

// Usage
myState.items[$each].price.subscribe(prices => ...);
// or with a nicer name
myState.items.$each.price.subscribe(prices => ...);
```

**Implementation sketch:**
```ts
// In the proxy handler for arrays
if (prop === '$each' || prop === $each) {
  return createWildcardNode(root$, [...path, '*']);
}

// createWildcardNode returns a special proxy that:
// 1. Tracks the wildcard position in the path
// 2. When subscribed, dynamically combines all matching paths
// 3. Re-subscribes when array length changes
```

**Challenges:**
1. **Type inference is HARD** - What's the type of `items.$each.price`?
   - It should be `Observable<number[]>` but TypeScript can't easily express "for array T[], $each gives you T"
   - Would need complex mapped types or sacrifice type safety

2. **Dynamic subscription management** - When items are added/removed:
   - Need to detect array length changes
   - Create/destroy subscriptions for new/removed items
   - Maintain subscription order

3. **Emission semantics** - When does it emit?
   - Every time ANY matched path changes?
   - Debounced/batched?
   - Only when the array of values changes?

### Approach B: String-Based Path Selector

```ts
myState.select('items.*.price').subscribe(prices => ...);
// or
wildcard(myState, 'items.*.price').subscribe(prices => ...);
```

**Pros:**
- Easier to implement (just a function, not proxy magic)
- Clear that it's a different API

**Cons:**
- Loses TypeScript inference entirely
- String-based = typos, no autocomplete
- Feels foreign to the proxy-based API

### Approach C: Higher-Order Observable Helper

```ts
import { eachIn } from 'deepstate';

// Returns Observable<Observable<number>[]> - array of price observables
eachIn(myState.items, item => item.price).subscribe(priceObservables => {
  combineLatest(priceObservables).subscribe(prices => ...);
});

// Or flattened version
selectEach(myState.items, item => item.price).subscribe(prices => {
  // prices: number[]
});
```

**Implementation:**
```ts
function selectEach<T, U>(
  arrayNode: RxArray<T>,
  selector: (item: RxNode<T>) => Observable<U>
): Observable<U[]> {
  return arrayNode.pipe(
    // When array changes, rebuild the combineLatest
    switchMap(items => {
      if (items.length === 0) return of([]);
      const observables = items.map((_, i) => selector(arrayNode.at(i)!));
      return combineLatest(observables);
    })
  );
}
```

**Pros:**
- Full TypeScript support
- Explicit selector function
- Composable with existing RxJS patterns
- Handles dynamic arrays naturally

**Cons:**
- Different API style (function vs property access)
- switchMap means resubscribing on every array change

## Deep Dive: The Type Problem

The fundamental issue with proxy-based wildcards is TypeScript:

```ts
type Items = { id: number; name: string; price: number }[];

// What should this return?
myState.items.$each.price

// Ideally: Observable<number[]>
// But TypeScript sees: 
//   items: RxArray<Item>
//   $each: ??? (not a property of RxArray)
//   .price: ??? (can't chain off unknown)
```

We'd need something like:

```ts
type RxArray<T> = {
  // ... existing methods
  $each: RxWildcard<T>;  // ← New
};

type RxWildcard<T> = T extends object 
  ? { [K in keyof T]: Observable<T[K][]> & RxWildcard<T[K]> }  // ← Recursive nightmare
  : Observable<T[]>;
```

This gets complex fast and may not even be expressible in TypeScript for deeply nested wildcards like `items.$each.tags.$each` (array of arrays).

## Performance Considerations

### Scenario: 1000 items, subscribed to `items.*.price`

**Naive implementation:**
- 1000 individual subscriptions
- Each price change triggers the aggregate
- Array resize = 1000 subscription operations

**Better implementation:**
- Subscribe to the array itself
- Derive prices with map()
- distinctUntilChanged on the prices array
- Cost: O(n) comparison on each array change

**Comparison with current approach:**
```ts
// Current: subscribe to array, map out prices
myState.items.pipe(
  map(items => items.map(i => i.price)),
  distinctUntilChanged(arraysEqual)
).subscribe(prices => ...);
```

This is already O(n) on array changes. Wildcards wouldn't be faster - they'd likely be slower due to subscription management overhead.

## The Verdict: Is It Worth It?

### Arguments FOR wildcards:

1. **Cleaner syntax** for common patterns
2. **Discoverable** - users might expect `items.*.price` to work
3. **More precise subscriptions** - only fires when specific fields change

### Arguments AGAINST wildcards:

1. **TypeScript complexity** - May require sacrificing type safety or complex types
2. **API inconsistency** - Introduces a different pattern into a clean proxy API
3. **Not actually more performant** - May be slower due to subscription overhead
4. **Alternatives exist** - RxJS operators already solve this
5. **Scope creep** - Opens door to more complex patterns (`**`, `items[0:5]`, etc.)
6. **Testing burden** - Edge cases with dynamic arrays, nested wildcards, etc.

### Recommendation

**Don't add wildcard subscriptions.** Instead:

1. **Document the RxJS pattern** clearly:
   ```ts
   // To subscribe to all item prices:
   myState.items.pipe(
     map(items => items.map(i => i.price)),
     distinctUntilChanged(arraysEqual)
   ).subscribe(prices => ...);
   ```

2. **Consider a helper function** (not a proxy extension):
   ```ts
   import { selectFrom } from 'deepstate';
   
   selectFrom(myState.items, item => item.price).subscribe(prices => ...);
   ```
   
   This keeps the API simple while providing convenience.

3. **Keep the core library focused** on the proxy-based access pattern that's working well.

## Solution: `selectFromEach` Helper

Instead of complex wildcards, we added a simple helper function:

```ts
import { state, selectFromEach } from 'deepstate';

const store = state({
  items: [
    { id: 1, name: 'Widget', price: 9.99, qty: 2 },
    { id: 2, name: 'Gadget', price: 19.99, qty: 1 },
  ]
});

// Subscribe to all prices - only emits when prices actually change
selectFromEach(store.items, item => item.price).subscribe(prices => {
  console.log('Prices:', prices);
});

// Complex derived values work too
selectFromEach(store.items, item => ({ name: item.name, price: item.price }))
  .subscribe(summaries => console.log(summaries));
```

**Benefits:**
- Full TypeScript inference
- Simple implementation (~10 lines)
- Handles the "only emit when selected values change" problem
- Doesn't pollute the core proxy API
- Easy to understand and debug

## Conclusion

Wildcard subscriptions would add significant complexity for marginal benefit. The current RxJS-based approach is already capable and type-safe. If convenience is desired, a simple `selectFrom` helper function is the better path forward.
