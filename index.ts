import { state } from "./src/deepstate";


// Create reactive state with nested objects and arrays
const myState = state({
  user: {
    name: "Alice",
    profile: {
      age: 30,
      email: "alice@example.com",
    },
    address: {
      city: "Wonderland",
      zip: "12345",
    },
  },
  todos: [
    { id: 1, text: "Learn RxJS", done: false },
    { id: 2, text: "Build rx-state", done: true },
  ],
  count: 0,
});

console.log("=== update() Demo ===\n");

// Track emissions
let stateEmissions = 0;
myState.subscribe((state) => {
  stateEmissions++;
  console.log(`State emission #${stateEmissions}:`, JSON.stringify(state, null, 2));
});

// Without update() - multiple .set() calls would cause multiple emissions
// myState.user.name.set("Bob");        // emission
// myState.user.profile.age.set(31);    // emission
// myState.user.address.city.set("NY"); // emission

// With update() - single emission for all changes
console.log("\n--- Calling update() on user ---");
const newUser = myState.user.update((user) => {
  user.name = "Bob";
  user.profile.age = 31;
  user.address.city = "New York";
});

myState.update(state => {
  state.user.name = "John";
  state.todos.push({ id: 3, text: "Review code", done: false });
});

console.log("\nReturned value:", newUser);
console.log("Total user emissions:", stateEmissions); // 2: initial + 1 update

// Works on arrays too
console.log("\n--- Calling update() on todos ---");
let todoEmissions = 0;
myState.todos.subscribe((todos) => {
  todoEmissions++;
  console.log(`Todos emission #${todoEmissions}:`, todos.map((t) => t.text));
});

// const newTodos = myState.todos.update((todos) => {
//   todos.push({ id: 3, text: "Write tests", done: false });
//   todos.push({ id: 4, text: "Deploy", done: false });
//   if (todos[0]) todos[0].done = true; // Mark first todo as done
// });

// console.log("\nNew todos:", newTodos);
console.log("Total todo emissions:", todoEmissions); // 2: initial + 1 update

console.log("\n--- Final state ---");
console.log(JSON.stringify(myState.get(), null, 2));
