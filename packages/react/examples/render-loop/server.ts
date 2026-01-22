import index from "./index.html";

Bun.serve({
  port: 3457,
  routes: {
    "/": index,
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log("Server running at http://localhost:3457");
console.log("Open in Safari to test for stack overflow!");
