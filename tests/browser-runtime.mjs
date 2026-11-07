import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const work = path.join(root, "work");
export const screenSizes = [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
];
const next = fileURLToPath(import.meta.resolve("next/dist/bin/next"));

async function freePort() {
  const socket = createServer();
  await new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", resolve);
  });
  const port = socket.address().port;
  await new Promise((resolve, reject) =>
    socket.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

export async function withServer(cwd, run, overrides = {}) {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: "1",
    SUPABASE_URL: "",
    SUPABASE_PUBLISHABLE_KEY: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    PAYSTACK_ENVIRONMENT: "",
    PAYSTACK_SECRET_KEY: "",
    PAYSTACK_CHANNELS: "",
    PAYSTACK_WEBHOOK_MODE: "",
    PAYSTACK_WEBHOOK_SECRET: "",
    ...overrides,
    AUDACE_APP_ORIGIN: origin,
  };
  const child = spawn(
    process.execPath,
    [next, "start", "--hostname", "127.0.0.1", "--port", String(port)],
    { cwd, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  child.stdout.on("data", (data) => {
    output += data;
  });
  child.stderr.on("data", (data) => {
    output += data;
  });
  const completion = new Promise((resolve) => child.once("close", resolve));
  try {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) break;
      const response = await fetch(origin, {
        signal: AbortSignal.timeout(1500),
      }).catch(() => null);
      if (response?.ok) return await run(origin);
      await delay(250);
    }
    throw new Error(
      `Next.js failed to start. Run npm run build first.\n${output}`,
    );
  } finally {
    child.kill();
    await completion;
  }
}

export async function withPage(browser, viewport, run) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (entry) => {
    if (entry.type() === "error" && /hydrat/i.test(entry.text()))
      errors.push(entry.text());
  });
  try {
    await run(page);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}
