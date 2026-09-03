import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// RTL's automatic afterEach cleanup only self-registers when it detects testing globals
// (globals: true); this project keeps globals off so tsc doesn't need vitest's ambient types
// merged into the main app's type-check, so cleanup is wired explicitly here instead.
afterEach(() => {
  cleanup();
});
