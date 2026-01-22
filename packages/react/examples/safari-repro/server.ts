// Simple Bun server to serve the reproduction app
import index from "./index.html";

console.log("Starting Safari reproduction server...");
console.log("Open http://localhost:3456 in Safari to test");

Bun.serve({
  port: 3456,
  routes: {
    "/": index,
  },
  development: {
    hmr: true,
    console: true,
  },
});
