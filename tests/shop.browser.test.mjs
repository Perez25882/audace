import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { withShopGateway } from "./database/gateway.mjs";

const tests = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(tests, "..");
const work = path.join(root, "work");
const next = fileURLToPath(import.meta.resolve("next/dist/bin/next"));
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1", SUPABASE_URL: "", SUPABASE_PUBLISHABLE_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "" };
const screenSizes = [{ width: 1440, height: 1000 }, { width: 390, height: 844 }];
const liveSlugs = [
  "cream-short-sleeve", "black-short-sleeve", "burgundy-short-sleeve",
  "white-short-sleeve", "cream-long-sleeve", "black-long-sleeve", "burgundy-long-sleeve",
];

function nextProcess(args, cwd, overrides) {
  const child = spawn(process.execPath, [next, ...args], { cwd, env: { ...env, ...overrides }, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const completion = new Promise((resolve) => {
    child.once("error", (error) => resolve({ code: null, output: String(error) }));
    child.once("close", (code) => resolve({ code, output }));
  });
  return { child, completion, output: () => output };
}

async function freePort() {
  const socket = createServer();
  await new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", resolve);
  });
  const port = socket.address().port;
  await new Promise((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function withServer(cwd, run, overrides = {}) {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const server = nextProcess(["start", "--hostname", "127.0.0.1", "--port", String(port)], cwd, { ...overrides, AUDACE_APP_ORIGIN: origin });
  try {
    for (let attempt = 0; attempt < 120; attempt++) {
      if (server.child.exitCode !== null) break;
      const response = await fetch(origin, { signal: AbortSignal.timeout(1500) }).catch(() => null);
      if (response?.ok) return await run(origin);
      await delay(250);
    }
    throw new Error(`Next.js failed to start. Run npm run build before the browser tests.\n${server.output()}`);
  } finally {
    server.child.kill();
    await server.completion;
  }
}

async function withPage(browser, viewport, run) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (entry) => {
    if (entry.type() === "error" && /hydrat/i.test(entry.text())) errors.push(entry.text());
  });
  try {
    await run(page);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

async function checkWidth(page, width) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
}

async function checkProduct(page, slug, sku) {
  const image = page.locator(".product-image img");
  await image.evaluate((element) => element.decode());
  const source = new URL(await image.getAttribute("src"), page.url());
  assert.equal(source.searchParams.get("url"), `/garments/${slug}.webp`);
  await page.getByText(sku, { exact: false }).waitFor();
}

async function liveJourney(browser, origin) {
  for (const viewport of screenSizes) {
    await withPage(browser, viewport, async (page) => {
      await page.goto(origin);
      await page.keyboard.press("Tab");
      assert.equal(await page.evaluate(() => document.activeElement.textContent), "Skip to content");
      await page.keyboard.press("Enter");
      assert.equal(await page.evaluate(() => document.activeElement.id), "main-content");
      await page.getByRole("link", { name: "Explore the collection" }).click();
      assert.equal(await page.locator(".garment-card").count(), 7);
      await page.getByRole("button", { name: "Long sleeve", exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll(".garment-card").length === 3);
      await page.getByRole("link", { name: "Burgundy Long sleeve" }).click();
      await page.waitForURL("**/burgundy-long-sleeve");
      await checkProduct(page, "burgundy-long-sleeve", "AUD-BG-LS");
      await page.getByText("Price to be confirmed").waitFor();
      await page.getByText("Sizes to be confirmed.").waitFor();
      await page.getByText("Ordering details are pending.").waitFor();
      assert.equal(await page.getByRole("button", { name: "Add to Bag" }).isDisabled(), true);
      await page.getByText("Size guide", { exact: true }).click();
      await page.getByText("Size guidance will be published when measurements are confirmed.").waitFor();
      const zoom = page.getByRole("button", { name: "Zoom image" });
      await zoom.focus();
      await page.keyboard.press("Enter");
      await page.getByRole("dialog").waitFor();
      await page.locator(".gallery-zoom img").evaluate((image) => image.decode());
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await page.waitForFunction(() => document.activeElement.textContent.includes("Zoom image"));
      await page.getByRole("link", { name: "White, short sleeve" }).click();
      await page.waitForURL("**/white-short-sleeve");
      await checkProduct(page, "white-short-sleeve", "AUD-WH-SS");
      assert.equal(await page.getByRole("link", { name: "Long sleeve", exact: true }).count(), 0);
      await checkWidth(page, viewport.width);
      await page.screenshot({ path: path.join(work, `phase-2-live-product-${viewport.width}.png`), fullPage: true });

      await page.evaluate(() => localStorage.setItem("audace-bag", "{"));
      await page.goto(origin + "/bag");
      await page.getByText("Your bag is empty.", { exact: true }).waitFor();
      await page.evaluate(() => localStorage.setItem("audace-bag", JSON.stringify({
        version: 1, items: [{ variantId: "audace-cr-ss", size: "Outdated size", quantity: 1 }],
      })));
      await page.goto(origin + "/checkout");
      await page.getByText(/unconfirmed prices, sizes, or stock/).waitFor();
      await page.getByText("Delivery methods and fees are awaiting confirmation.").waitFor();
      assert.equal(await page.getByRole("button", { name: "Review delivery details" }).isDisabled(), true);
      assert.equal(await page.getByLabel("Full name").isDisabled(), true);
      await checkWidth(page, viewport.width);
    });
  }

  await withPage(browser, { width: 320, height: 900 }, async (page) => {
    for (const slug of liveSlugs) {
      const response = await page.goto(origin + "/products/" + slug);
      assert.equal(response.status(), 200);
      await page.locator(".product-image img").evaluate((image) => image.decode());
      await checkWidth(page, 320);
    }
    assert.equal((await page.goto(origin + "/products/white-long-sleeve")).status(), 404);
    assert.equal((await page.goto(origin + "/order-confirmation")).status(), 200);
    await page.getByRole("heading", { name: "No order to display." }).waitFor();
  });
}

async function fixtureJourney(browser, origin, gateway) {
  for (const viewport of screenSizes) {
    await withPage(browser, viewport, async (page) => {
      const bagLink = (count) => page.getByRole("navigation", { name: "Primary" }).getByRole("link", {
        name: `Bag, ${count} ${count === 1 ? "item" : "items"}`,
      });
      await page.goto(origin);
      await page.getByRole("link", { name: "Cream Short sleeve" }).click();
      await page.waitForURL("**/cream-short-sleeve");
      await checkProduct(page, "cream-short-sleeve", "AUD-CR-SS");
      await page.getByText("GHS 399.95", { exact: true }).waitFor();
      const add = page.getByRole("button", { name: "Add to Bag" });
      const size = page.getByRole("radio", { name: "Fixture A" });
      assert.equal(await add.isDisabled(), true);
      await size.check();
      await page.getByRole("button", { name: "Increase quantity" }).click();
      await add.click();
      await bagLink(2).waitFor();
      await page.getByText("Added to your bag.", { exact: true }).waitFor();
      await page.getByRole("link", { name: "Long sleeve", exact: true }).click();
      await page.waitForURL("**/cream-long-sleeve");
      await checkProduct(page, "cream-long-sleeve", "AUD-CR-LS");
      await page.getByText("GHS 549.00", { exact: true }).waitFor();
      assert.equal(await size.isChecked(), false);
      assert.equal(await page.getByRole("radio", { name: "Fixture B (unavailable)" }).isDisabled(), true);
      await size.check();
      await add.click();
      await bagLink(3).click();
      const bag = page.getByRole("list", { name: "Bag items" });
      await bag.waitFor();
      assert.equal(await bag.getByRole("listitem").count(), 2);
      const subtotal = (amount) => page.getByRole("complementary", { name: "Bag summary" }).getByText(amount, { exact: true });
      await subtotal("GHS 1,348.90").waitFor();
      await page.reload();
      await bagLink(3).waitFor();
      await subtotal("GHS 1,348.90").waitFor();
      const shortQuantity = page.getByRole("group", { name: "Quantity for Cream short sleeve, size Fixture A" });
      await shortQuantity.getByRole("button", { name: "Increase quantity" }).click();
      await subtotal("GHS 1,748.85").waitFor();
      await shortQuantity.getByRole("button", { name: "Decrease quantity" }).click();
      await subtotal("GHS 1,348.90").waitFor();
      await page.getByRole("button", { name: "Remove Cream long sleeve, size Fixture A" }).click();
      await bagLink(2).waitFor();
      await subtotal("GHS 799.90").waitFor();
      await checkWidth(page, viewport.width);
      await page.screenshot({ path: path.join(work, `phase-2-fixture-bag-${viewport.width}.png`), fullPage: true });
      await page.getByRole("link", { name: "Continue to checkout" }).click();
      await page.getByRole("heading", { name: "Guest checkout" }).waitFor();
      const review = page.getByRole("button", { name: "Review delivery details" });
      const method = page.getByLabel("Delivery method");
      await page.getByLabel("Region", { exact: true }).selectOption("Ashanti");
      assert.equal(await review.isDisabled(), true);
      assert.equal(await method.isDisabled(), true);
      await page.getByLabel("Region", { exact: true }).selectOption("Greater Accra");
      await method.selectOption("10000000-0000-4000-8000-000000000001");
      await page.getByLabel("Email address").fill("invalid");
      await page.getByLabel("Ghanaian phone number").fill("12345");
      await review.click();
      await page.getByRole("alert").getByText("Enter a valid email address.").waitFor();
      assert.equal(await page.getByLabel("Ghanaian phone number").getAttribute("aria-invalid"), "true");
      await page.getByLabel("Full name").fill("Fixture Customer");
      await page.getByLabel("Email address").fill("fixture@example.test");
      await page.getByLabel("Ghanaian phone number").fill("020 000 0000");
      await page.getByLabel("Town or city").fill("Accra");
      await page.getByLabel("Delivery address").fill("Fixture address");
      await page.getByRole("complementary", { name: "Order summary" }).getByText("GHS 812.40", { exact: true }).waitFor();
      const posts = [];
      page.on("request", (request) => { if (request.method() === "POST") posts.push(request.url()); });
      await review.click();
      await page.getByText("Delivery details checked. Payments and order placement are currently unavailable.").waitFor();
      assert.equal(posts.length, 1);
      assert.ok(!await page.evaluate(() => JSON.stringify(localStorage).includes("Fixture Customer")));
      await checkWidth(page, viewport.width);
      await page.screenshot({ path: path.join(work, `phase-3-fixture-checkout-${viewport.width}.png`), fullPage: true });
      await gateway.setPrice(42000);
      try {
        await review.click();
        await page.getByText(/current quote reflects a price or delivery fee change/).waitFor();
        await page.getByRole("complementary", { name: "Order summary" }).getByText("GHS 852.50", { exact: true }).waitFor();
      } finally {
        await gateway.setPrice(39995);
      }
    });
  }
  await withPage(browser, screenSizes[0], async (page) => {
    assert.equal((await page.goto(origin + "/products/black-long-sleeve")).status(), 404);
    gateway.setOutage(true);
    try {
      await page.goto(origin + "/products/cream-short-sleeve");
      await page.getByRole("heading", { name: "Collection temporarily unavailable." }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Add to Bag" }).count(), 0);
    } finally {
      gateway.setOutage(false);
    }
    await page.goto(origin + "/admin/orders/00000000-0000-4000-8000-000000000001");
    await page.waitForURL("**/admin/login");
    for (const email of ["customer@example.test","owner@example.test"]) {
      await page.getByLabel("Email address").fill(email);
      await page.getByLabel("Password", { exact: true }).fill("Synthetic test password");
      await page.getByRole("button", { name: "Sign in" }).click();
      if (email.startsWith("customer")) {
        await page.waitForURL("**/admin/login?result=denied");
        await page.getByRole("alert").getByText(/Sign-in was unsuccessful/).waitFor();
      }
    }
    await page.getByRole("heading", { name: "Overview" }).waitFor();
    assert.ok((await page.context().cookies()).some((cookie) => cookie.name.includes("auth-token") && cookie.httpOnly && cookie.sameSite === "Lax"));
    await page.getByRole("link", { name: "Inventory", exact: true }).click();
    const row = page.getByRole("row", { name: /FIXTURE-CR-SS-A/ });
    await row.getByText("Set stock", { exact: true }).click();
    await row.getByLabel("New on-hand count").fill("3");
    await row.getByLabel("Adjustment reason").fill("Synthetic browser count");
    await row.getByRole("button", { name: "Save adjustment" }).click();
    await page.getByText("Changes saved.", { exact: true }).waitFor();
    await page.getByText("Synthetic browser count", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL("**/admin/login");
    assert.ok(!(await page.context().cookies()).some((cookie) => cookie.name.includes("auth-token")));
    await page.goto(origin + "/admin");
    await page.waitForURL("**/admin/login");
  });
}

test("live storefront blocks unconfigured commerce and preserves all seven images and routes", { timeout: 180_000 }, async () => {
  await mkdir(work, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.AUDACE_TEST_BROWSER || "chrome" });
  try {
    await withServer(root, (origin) => liveJourney(browser, origin));
  } finally {
    await browser.close();
  }
});

test("isolated test catalogue supports a complete guest review journey on desktop and mobile", { timeout: 360_000 }, async () => {
  const browser = await chromium.launch({ channel: process.env.AUDACE_TEST_BROWSER || "chrome" });
  try {
    await withShopGateway((gateway) => withServer(root, (origin) => fixtureJourney(browser, origin, gateway), {
      SUPABASE_URL: gateway.url, SUPABASE_PUBLISHABLE_KEY: "fixture-publishable-key",
    }));
  } finally {
    await browser.close();
  }
});
