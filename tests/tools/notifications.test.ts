import { test, expect } from "bun:test";
import { registerNotificationsTools } from "../../src/tools/notifications.js";

test("registerNotificationsTools is a function", () => {
  expect(typeof registerNotificationsTools).toBe("function");
});
