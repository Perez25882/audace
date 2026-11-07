import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { withServer, withPage, root, work } from "./browser-runtime.mjs";
import { withShopGateway } from "./database/gateway.mjs";
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.resolve("work/browsers");
const { chromium, webkit, devices } = await import("playwright-core");
const widths = [320, 360, 375, 390, 414, 768, 1024, 1440, 1920];
const slugs = [
  "cream-short-sleeve",
  "cream-long-sleeve",
  "black-short-sleeve",
  "black-long-sleeve",
  "burgundy-short-sleeve",
  "burgundy-long-sleeve",
  "white-short-sleeve",
];
const audits = [];
async function scan(page, label) {
  const source = await readFile(
    path.join(root, "node_modules/axe-core/axe.min.js"),
    "utf8",
  );
  await page.evaluate(source);
  const result = await page.evaluate(async () => {
    const r = await window.axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
      },
    });
    return {
      violations: r.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => n.target),
      })),
      incomplete: r.incomplete.map((v) => v.id),
    };
  });
  audits.push({ label, ...result });
  assert.deepEqual(result.violations, [], label);
}
async function width(page, value) {
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth),
    value,
    page.url(),
  );
}
async function login(page, origin, email = "owner@example.test") {
  await page.goto(origin + "/admin/login");
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Synthetic test password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("heading", { name: "Overview", exact: true }).waitFor();
}
async function paidFixture(gateway) {
  const a = await gateway.db.rpc("service_role", null, "audace_payment_begin", {
    p_request: randomUUID(),
    p_access: "f".repeat(64),
    p_lines: [{ variantId: "audace-cr-ss", size: "Fixture B", quantity: 1 }],
    p_delivery: "10000000-0000-4000-8000-000000000001",
    p_expected: 41245,
    p_contact: {
      name: "Synthetic QA buyer",
      email: "qa@example.test",
      phone: "+233200000000",
      region: "Greater Accra",
      city: "Accra",
      address: "Synthetic QA address",
      directions: "",
    },
  });
  await gateway.db.rpc("service_role", null, "audace_payment_apply", {
    p_reference: a.reference,
    p_data: {
      providerId: "87654321",
      reference: a.reference,
      domain: "test",
      currency: "GHS",
      amount: 41245,
      status: "success",
      orderId: a.orderId,
      attemptId: a.attemptId,
      email: "qa@example.test",
      channel: "card",
      paidAt: new Date().toISOString(),
    },
  });
  return a;
}
test(
  "release storefront preserves artwork, keyboard focus, security and reflow across nine widths and WebKit",
  { timeout: 600000 },
  async () => {
    await mkdir(work, { recursive: true });
    const browser = await chromium.launch({
      channel: process.env.AUDACE_TEST_BROWSER || "chrome",
    });
    try {
      await withServer(root, async (origin) => {
        const response = await fetch(origin);
        const csp = response.headers.get("content-security-policy");
        assert.ok(csp.includes("'strict-dynamic'"));
        assert.ok(!csp.includes("'unsafe-eval'"));
        assert.equal(response.headers.get("x-content-type-options"), "nosniff");
        assert.equal(response.headers.get("x-frame-options"), "DENY");
        assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
        const again = await fetch(origin);
        assert.notEqual(again.headers.get("content-security-policy"), csp);
        assert.ok(
          (await (await fetch(origin + "/robots.txt")).text()).includes(
            "Disallow: /",
          ),
        );
        assert.ok(
          !(await (await fetch(origin + "/sitemap.xml")).text()).includes(
            "<loc>",
          ),
        );
        assert.deepEqual(await (await fetch(origin + "/api/health")).json(), {
          status: "ok",
          service: "audace",
        });
        for (const size of widths) {
          await withPage(
            browser,
            { width: size, height: 1000 },
            async (page) => {
              const violations = [];
              page.on("console", (e) => {
                if (
                  e.type() === "error" &&
                  /Content Security Policy|Refused to/i.test(e.text())
                )
                  violations.push(e.text());
              });
              await page.goto(origin);
              await page.evaluate(() => document.fonts.ready);
              await width(page, size);
              await page.keyboard.press("Tab");
              assert.equal(
                await page.evaluate(() => document.activeElement.textContent),
                "Skip to content",
              );
              if ([320, 390, 768, 1440].includes(size))
                await scan(page, "home-" + size);
              await page
                .getByRole("link", {
                  name: "Burgundy Short sleeve",
                  exact: true,
                })
                .click();
              await page.getByRole("button", { name: "Zoom image" }).waitFor();
              await width(page, size);
              const img = page.locator(".product-image img");
              await img.evaluate((e) => e.decode());
              assert.ok(
                (await img.getAttribute("src")).includes(
                  "burgundy-short-sleeve",
                ),
              );
              await page.getByRole("button", { name: "Zoom image" }).click();
              await page.getByRole("dialog").waitFor();
              for (let n = 0; n < 6; n++) {
                await page.keyboard.press("Tab");
                assert.ok(
                  await page.evaluate(() =>
                    document
                      .querySelector("dialog")
                      .contains(document.activeElement),
                  ),
                );
              }
              await page.keyboard.press("Shift+Tab");
              assert.ok(
                await page.evaluate(() =>
                  document
                    .querySelector("dialog")
                    .contains(document.activeElement),
                ),
              );
              if ([320, 390, 1440].includes(size))
                await scan(page, "dialog-" + size);
              await page.keyboard.press("Escape");
              assert.equal(
                await page
                  .getByRole("button", { name: "Zoom image" })
                  .evaluate((e) => e === document.activeElement),
                true,
              );
              await page
                .getByRole("link", { name: "White, short sleeve" })
                .click();
              await page.waitForURL("**/white-short-sleeve");
              await width(page, size);
              assert.equal(
                await page
                  .getByRole("link", { name: "Long sleeve", exact: true })
                  .count(),
                0,
              );
              for (const route of [
                "/bag",
                "/checkout",
                "/payment-status",
                "/order-confirmation",
                "/information",
              ]) {
                await page.goto(origin + route);
                await width(page, size);
                if ([390, 1440].includes(size))
                  await scan(page, route + "-" + size);
              }
              if ([320, 390, 768, 1440].includes(size)) {
                await page.goto(origin);
                await page.screenshot({
                  path: path.join(work, "phase-5-home-" + size + ".png"),
                  fullPage: true,
                });
              }
              assert.deepEqual(violations, []);
            },
          );
        }
        await withPage(browser, { width: 320, height: 844 }, async (page) => {
          for (const slug of slugs) {
            await page.goto(origin + "/products/" + slug);
            await page
              .locator(".product-image img")
              .evaluate((e) => e.decode());
            assert.ok(
              (
                await page.locator(".product-image img").getAttribute("src")
              ).includes(slug),
            );
            await width(page, 320);
          }
          assert.equal(
            (await page.goto(origin + "/products/white-long-sleeve")).status(),
            404,
          );
          await page.emulateMedia({ reducedMotion: "reduce" });
          assert.equal(
            await page.evaluate(
              () => matchMedia("(prefers-reduced-motion: reduce)").matches,
            ),
            true,
          );
        });
        const safari = await webkit.launch();
        try {
          const context = await safari.newContext({
            viewport: { width: 390, height: 844 },
            isMobile: true,
            hasTouch: true,
            deviceScaleFactor: 3,
            userAgent: devices["iPhone 13"].userAgent,
          });
          const page = await context.newPage();
          for (const route of [
            "/",
            "/products/cream-long-sleeve",
            "/bag",
            "/checkout",
          ]) {
            await page.goto(origin + route);
            await width(page, 390);
          }
          await page.goto(origin + "/products/cream-long-sleeve");
          await page.getByRole("button", { name: "Zoom image" }).click();
          await page.getByRole("dialog").waitFor();
          await page.getByRole("button", { name: "Close image" }).click();
          await context.close();
        } finally {
          await safari.close();
        }
      });
    } finally {
      await browser.close();
      await writeFile(
        path.join(work, "phase-5-accessibility.json"),
        JSON.stringify(audits, null, 2),
      );
    }
  },
);

test(
  "configured release metadata, responsive administration, persistence and session rejection",
  { timeout: 600000 },
  async () => {
    await withShopGateway(async (gateway) => {
      await withServer(
        root,
        async (origin) => {
          const browser = await chromium.launch({
            channel: process.env.AUDACE_TEST_BROWSER || "chrome",
          });
          try {
            const robots = await (await fetch(origin + "/robots.txt")).text();
            assert.ok(robots.includes("Disallow: /admin"));
            assert.ok(robots.includes("https://audace.example/sitemap.xml"));
            const sitemap = await (await fetch(origin + "/sitemap.xml")).text();
            assert.ok(sitemap.includes("cream-short-sleeve"));
            assert.ok(!sitemap.includes("black-long-sleeve"));
            await withPage(
              browser,
              { width: 390, height: 844 },
              async (page) => {
                await page.goto(origin + "/products/cream-short-sleeve");
                assert.equal(
                  await page
                    .locator('link[rel="canonical"]')
                    .getAttribute("href"),
                  "https://audace.example/products/cream-short-sleeve",
                );
                assert.equal(
                  await page
                    .locator('meta[property="og:image"]')
                    .getAttribute("content"),
                  "https://audace.example/garments/cream-short-sleeve.webp",
                );
                assert.equal(
                  await page
                    .locator('meta[property="og:site_name"]')
                    .getAttribute("content"),
                  "AUDACE",
                );
                assert.equal(
                  await page
                    .locator('meta[name="twitter:card"]')
                    .getAttribute("content"),
                  "summary_large_image",
                );
                const schema = JSON.parse(
                  await page
                    .locator('script[type="application/ld+json"]')
                    .textContent(),
                );
                assert.equal(schema.offers.price, "399.95");
                assert.equal(schema.offers.priceCurrency, "GHS");
                assert.ok(!schema.aggregateRating);
                await page.getByRole("radio", { name: "Fixture A" }).check();
                await page.getByRole("button", { name: "Add to Bag" }).click();
                await page
                  .getByRole("link", { name: "View bag", exact: true })
                  .click();
                for (const size of widths) {
                  await page.setViewportSize({ width: size, height: 1000 });
                  await width(page, size);
                }
                await page.goto(origin + "/checkout");
                for (const size of [320, 390, 768, 1440]) {
                  await page.setViewportSize({ width: size, height: 1000 });
                  await width(page, size);
                  await scan(page, "configured-checkout-" + size);
                }
                await page
                  .getByLabel("Region", { exact: true })
                  .selectOption("Greater Accra");
                await page
                  .getByLabel("Delivery method")
                  .selectOption("10000000-0000-4000-8000-000000000001");
                await page
                  .getByRole("button", { name: "Review delivery details" })
                  .click();
                await scan(page, "checkout-errors");
                for (const route of [
                  "/admin",
                  "/admin/catalogue",
                  "/admin/inventory",
                  "/admin/orders",
                  "/admin/delivery",
                  "/admin/payments",
                ]) {
                  await page.goto(origin + route);
                  assert.equal(new URL(page.url()).pathname, "/admin/login");
                }
                await login(page, origin);
                const paid = await paidFixture(gateway);
                for (const route of [
                  "/admin",
                  "/admin/catalogue",
                  "/admin/inventory",
                  "/admin/orders",
                  "/admin/delivery",
                  "/admin/payments",
                ]) {
                  await page.goto(origin + route);
                  await page
                    .getByRole("button", { name: "Sign out", exact: true })
                    .waitFor();
                  assert.equal(
                    await page
                      .getByRole("heading", {
                        name: "Store records are unavailable.",
                      })
                      .count(),
                    0,
                    route,
                  );
                  for (const size of widths) {
                    await page.setViewportSize({ width: size, height: 1000 });
                    await width(page, size);
                  }
                  await page.setViewportSize({ width: 390, height: 844 });
                  await scan(page, route + "-390");
                }
                await page.goto(origin + "/admin/orders");
                await page
                  .locator('a[href="/admin/orders/' + paid.orderId + '"]')
                  .click();
                await page
                  .getByRole("button", {
                    name: "Start fulfilment",
                    exact: true,
                  })
                  .waitFor();
                for (const size of widths) {
                  await page.setViewportSize({ width: size, height: 1000 });
                  await width(page, size);
                }
                await page.setViewportSize({ width: 390, height: 844 });
                await scan(page, "admin-paid-order");
                await page.screenshot({
                  path: path.join(work, "phase-5-admin-order-390.png"),
                  fullPage: true,
                });
                await page
                  .getByRole("button", {
                    name: "Start fulfilment",
                    exact: true,
                  })
                  .click();
                await page
                  .getByRole("button", { name: "Mark shipped", exact: true })
                  .waitFor();
                await gateway.db.rpc(
                  "service_role",
                  null,
                  "audace_payment_record_event",
                  {
                    p_id: "f".repeat(64),
                    p_type: "refund.pending",
                    p_ref: paid.reference,
                    p_provider: "87654322",
                    p_evidence: { domain: "test" },
                  },
                );
                await page.reload();
                await page
                  .getByRole("heading", {
                    name: "Payment requires review",
                    exact: true,
                  })
                  .waitFor();
                assert.equal(
                  await page
                    .getByRole("button", { name: "Mark shipped", exact: true })
                    .count(),
                  0,
                );
                await scan(page, "admin-financial-review");
                await page.screenshot({
                  path: path.join(work, "phase-5-admin-review-390.png"),
                  fullPage: true,
                });
                await page.goto(origin + "/admin/catalogue");
                const article = page.getByRole("article").filter({
                  has: page.getByRole("heading", {
                    name: "Cream · Short sleeve",
                    exact: true,
                  }),
                });
                await article.getByLabel("Price in GHS").fill("410.00");
                await article
                  .getByRole("button", { name: "Save variant", exact: true })
                  .click();
                await page
                  .getByText("Changes saved.", { exact: true })
                  .waitFor();
                await page.goto(origin + "/products/cream-short-sleeve");
                await page.getByText("GHS 410.00", { exact: true }).waitFor();
                await gateway.setPrice(39995);
                await page.goto(origin + "/admin/delivery");
                const form = page.locator("form").filter({
                  has: page.getByRole("button", {
                    name: "Save delivery method",
                    exact: true,
                  }),
                });
                await form.getByLabel("Approved fee in GHS").fill("14.50");
                await form
                  .getByRole("button", { name: "Save delivery method" })
                  .click();
                await page
                  .getByText("Changes saved.", { exact: true })
                  .waitFor();
                assert.equal(
                  (
                    await gateway.db.sql(
                      "postgres",
                      null,
                      "select fee_pesewas from audace_delivery where id='10000000-0000-4000-8000-000000000001'",
                    )
                  )[0].fee_pesewas,
                  "1450",
                );
                await gateway.db.sql(
                  "postgres",
                  null,
                  "update audace_delivery set fee_pesewas=1250",
                );
                await page.goto(origin + "/admin");
                gateway.expireSessions();
                await page.goto(origin + "/admin/payments");
                assert.equal(new URL(page.url()).pathname, "/admin/login");
                await login(page, origin, "operator@example.test");
                await page.goto(origin + "/admin/catalogue");
                assert.equal(
                  await page
                    .getByRole("button", { name: "Save variant", exact: true })
                    .count(),
                  0,
                );
              },
            );
          } finally {
            await browser.close();
          }
        },
        {
          SUPABASE_URL: gateway.url,
          SUPABASE_PUBLISHABLE_KEY: "fixture-publishable-key",
          SUPABASE_SERVICE_ROLE_KEY: "fixture-service-role",
          AUDACE_PUBLIC_ORIGIN: "https://audace.example",
          AUDACE_INDEXING_ENABLED: "true",
        },
      );
    });
    await writeFile(
      path.join(work, "phase-5-accessibility.json"),
      JSON.stringify(audits, null, 2),
    );
  },
);
