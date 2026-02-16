import { describe, test, expect, beforeAll } from "bun:test";
import { getTestServer, type TestContext } from "./setup.js";

let ctx: TestContext;

beforeAll(async () => {
  ctx = await getTestServer();
});

describe("Health Check", () => {
  test("GET /health returns 200 with status ok", async () => {
    const res = await fetch(`${ctx.baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });
});
