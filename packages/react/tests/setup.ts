/**
 * Test setup for React Testing Library with Bun + jsdom
 */
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><html><body><div id=\"root\"></div></body></html>", {
  url: "http://localhost",
  pretendToBeVisual: true,
});

// Set up global DOM APIs
globalThis.window = dom.window as unknown as Window & typeof globalThis;
globalThis.document = dom.window.document;
globalThis.navigator = dom.window.navigator;

// Required for React 18+
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
