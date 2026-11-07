import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { chromium } from "playwright-core";
import { withShopGateway } from "./database/gateway.mjs";
import {
  withPaystack,
  fixtureSecret,
  fixtureSigning,
  fixtureWorker,
} from "./paystack-gateway.mjs";
import {
  root,
  work,
  screenSizes,
  withPage,
  withServer,
} from "./browser-runtime.mjs";

const contact = {
  name: "Synthetic Payment Buyer",
  email: "buyer@example.test",
  phone: "020 000 0000",
  region: "Greater Accra",
  city: "Accra",
  address: "Synthetic delivery address",
  directions: "",
  method: "10000000-0000-4000-8000-000000000001",
};

async function suite(run) {
  return withShopGateway((gateway) =>
    withPaystack((provider) =>
      withServer(
        root,
        async (origin) => {
          provider.configureApp(origin);
          const browser = await chromium.launch({
            channel: process.env.AUDACE_TEST_BROWSER || "chrome",
          });
          try {
            return await run({ gateway, provider, browser, origin });
          } finally {
            await browser.close();
          }
        },
        {
          SUPABASE_URL: gateway.url,
          SUPABASE_PUBLISHABLE_KEY: "fixture-publishable-key",
          SUPABASE_SERVICE_ROLE_KEY: "fixture-service-role",
          PAYSTACK_ENVIRONMENT: "test",
          PAYSTACK_SECRET_KEY: fixtureSecret,
          PAYSTACK_CHANNELS: "card,mobile_money",
          PAYSTACK_WEBHOOK_MODE: "timestamped",
          PAYSTACK_WEBHOOK_SECRET: fixtureSigning,
          PAYMENT_RECONCILE_SECRET: fixtureWorker,
          AUDACE_PROVIDER_MOCKS: "1",
          PAYSTACK_TEST_API_ORIGIN: provider.url,
        },
      ),
    ),
  );
}

function input() {
  return {
    requestId: randomUUID(),
    accessToken: randomBytes(32).toString("hex"),
    expectedTotal: 41245,
    contact,
    lines: [{ variantId: "audace-cr-ss", size: "Fixture A", quantity: 1 }],
  };
}
function initialize(page, origin, body) {
  return page.request.post(origin + "/api/payments/initialize", {
    headers: { origin, "content-type": "application/json" },
    data: body,
  });
}
function verify(page, origin, orderId) {
  return page.request.post(origin + "/api/payments/verify", {
    headers: { origin, "content-type": "application/json" },
    data: { orderId },
  });
}
function worker(origin) {
  return fetch(origin + "/api/internal/payments/reconcile", {
    method: "POST",
    headers: { authorization: `Bearer ${fixtureWorker}` },
  });
}
async function due(gateway) {
  await gateway.db.sql(
    "postgres",
    null,
    "update audace_payment_jobs set next_at=now(),lease_until=null where state='ready'",
  );
}

test(
  "hosted test checkout verifies payment, confirms private order and finalizes stock on desktop and mobile",
  { timeout: 420000 },
  async () => {
    await mkdir(work, { recursive: true });
    await suite(async ({ gateway, provider, browser, origin }) => {
      for (const viewport of screenSizes) {
        await withPage(browser, viewport, async (page) => {
          await page.goto(origin);
          await page.getByRole("link", { name: "Cream Short sleeve" }).click();
          await page.getByRole("radio", { name: "Fixture A" }).check();
          await page.getByRole("button", { name: "Add to Bag" }).click();
          await page
            .getByRole("link", { name: "View bag", exact: true })
            .click();
          await page
            .getByRole("link", { name: "Continue to checkout" })
            .click();
          await page.getByLabel("Full name").fill(contact.name);
          await page.getByLabel("Email address").fill(contact.email);
          await page.getByLabel("Ghanaian phone number").fill(contact.phone);
          await page
            .getByLabel("Region", { exact: true })
            .selectOption(contact.region);
          await page.getByLabel("Town or city").fill(contact.city);
          await page.getByLabel("Delivery address").fill(contact.address);
          await page.getByLabel("Delivery method").selectOption(contact.method);
          await page
            .getByRole("button", { name: "Review delivery details" })
            .click();
          await page
            .getByRole("button", { name: "Continue to Paystack" })
            .waitFor();
          if (viewport.width === 1440) {
            for (const width of [
              320, 360, 375, 390, 414, 768, 1024, 1440, 1920,
            ]) {
              await page.setViewportSize({ width, height: 1000 });
              assert.equal(
                await page.evaluate(() => document.documentElement.scrollWidth),
                width,
              );
              const paymentButton = page.getByRole("button", {
                name: "Continue to Paystack",
              });
              await paymentButton.scrollIntoViewIfNeeded();
              const box = await paymentButton.boundingBox();
              assert.ok(box && box.height >= 44 && box.width <= width);
            }
            await page.setViewportSize(viewport);
          }
          await page
            .getByRole("button", { name: "Continue to Paystack" })
            .click();
          await page
            .getByRole("heading", { name: "Synthetic payment gateway" })
            .waitFor();
          const reference = new URL(page.url()).pathname.split("/").at(-1);
          assert.equal(provider.transactions.get(reference).amount, 41245);
          await page
            .getByRole("button", { name: "Complete test payment" })
            .click();
          await page.waitForURL("**/order-confirmation?order=**", {
            timeout: 45000,
          });
          await page
            .getByRole("heading", { name: "Payment confirmed." })
            .waitFor();
          await page
            .getByText("Synthetic delivery address", { exact: false })
            .waitFor();
          await page
            .getByRole("complementary", { name: "Verified payment summary" })
            .getByText("GHS 412.45", { exact: true })
            .waitFor();
          const orderId = new URL(page.url()).searchParams.get("order");
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth),
            viewport.width,
          );
          await page.reload();
          await page
            .getByRole("heading", { name: "Payment confirmed." })
            .waitFor();
          await page.screenshot({
            path: path.join(work, `phase-4-confirmation-${viewport.width}.png`),
            fullPage: true,
          });
          const outsider = await browser.newContext({ viewport });
          try {
            const unknown = await outsider.newPage();
            await unknown.goto(
              origin +
                `/order-confirmation?order=${orderId}&reference=${reference}`,
            );
            await unknown
              .getByRole("heading", { name: "Order access is unavailable." })
              .waitFor();
            assert.equal(
              await unknown.getByText("Synthetic delivery address").count(),
              0,
            );
            assert.equal(
              (await verify(unknown, origin, orderId)).status(),
              404,
            );
            await unknown.goto(origin + "/admin/payments");
            assert.equal(new URL(unknown.url()).pathname, "/admin/login");
          } finally {
            await outsider.close();
          }
          assert.equal(
            (await provider.notify(provider.transactions.get(reference)))
              .status,
            200,
          );
          await due(gateway);
          assert.equal((await worker(origin)).status, 200);
        });
      }
      const stock = await gateway.db.sql(
        "postgres",
        null,
        "select on_hand from audace_stock where sku_id='30000000-0000-4000-8000-000000000001'",
      );
      assert.equal(stock[0].on_hand, 2);
      assert.equal(
        (
          await gateway.db.sql(
            "postgres",
            null,
            "select count(*)::int as count from audace_payment_receipts",
          )
        )[0].count,
        2,
      );
      await withPage(browser, screenSizes[0], async (page) => {
        assert.equal(
          (await fetch(origin + "/api/internal/health")).status,
          401,
        );
        const health = await fetch(origin + "/api/internal/health", {
          headers: { authorization: "Bearer " + fixtureWorker },
        });
        assert.equal(health.status, 200);
        assert.equal((await health.json()).workerRecent, true);
        await page.goto(origin + "/admin/login");
        await page.getByLabel("Email address").fill("owner@example.test");
        await page
          .getByLabel("Password", { exact: true })
          .fill("Synthetic test password");
        await page.getByRole("button", { name: "Sign in" }).click();
        await page.getByRole("heading", { name: "Overview" }).waitFor();
        await page.getByText("GHS 824.90", { exact: true }).waitFor();
        await page.getByRole("link", { name: "Payments", exact: true }).click();
        await page
          .getByRole("region", { name: "Payment attempts" })
          .getByRole("row")
          .nth(2)
          .waitFor();
        assert.equal(
          await page
            .getByRole("region", { name: "Payment attempts" })
            .getByRole("row")
            .count(),
          3,
        );
        await page.screenshot({
          path: path.join(work, "phase-4-admin-payments.png"),
          fullPage: true,
        });
      });
    });
  },
);

test(
  "initialization interruption, signed webhook retries and database processing failure recover durably",
  { timeout: 420000 },
  async () => {
    await suite(async ({ gateway, provider, browser, origin }) => {
      await withPage(browser, screenSizes[0], async (page) => {
        const body = input();
        assert.equal(
          (
            await fetch(origin + "/api/internal/payments/reconcile", {
              method: "POST",
            })
          ).status,
          401,
        );
        for (const invalid of [
          { ...body, expectedTotal: 1 },
          { ...body, lines: [{ ...body.lines[0], size: "missing" }] },
          { ...body, lines: [{ ...body.lines[0], quantity: 99 }] },
          { ...body, contact: { ...contact, method: randomUUID() } },
        ])
          assert.equal((await initialize(page, origin, invalid)).status(), 409);
        assert.equal(provider.calls(), 0);
        assert.equal(
          (
            await page.request.post(origin + "/api/payments/initialize", {
              headers: { origin: "https://attacker.test" },
              data: body,
            })
          ).status(),
          403,
        );
        provider.failInitialization("error");
        let response = await initialize(page, origin, body);
        assert.equal(response.status(), 202);
        response = await initialize(page, origin, body);
        assert.equal(response.status(), 200);
        const initialized = await response.json();
        const reference = new URL(initialized.authorizationUrl).pathname
          .split("/")
          .at(-1);
        const replay = await (await initialize(page, origin, body)).json();
        assert.equal(replay.authorizationUrl, initialized.authorizationUrl);
        assert.equal(provider.transactions.size, 1);
        assert.equal(
          (
            await gateway.db.sql(
              "postgres",
              null,
              "select count(*)::int as count from audace_orders",
            )
          )[0].count,
          1,
        );
        const transaction = provider.transactions.get(reference);
        const raw = JSON.stringify({
          event: "charge.success",
          data: {
            id: transaction.id,
            domain: "test",
            reference,
            status: "success",
            amount: 41245,
            currency: "GHS",
          },
        });
        assert.equal(
          (
            await fetch(origin + "/api/payments/webhook", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: raw,
            })
          ).status,
          401,
        );
        assert.equal(
          (
            await provider.notify(transaction, {
              signature: `t=${Math.floor(Date.now() / 1000)},v1=whk_fixture:${"0".repeat(128)}`,
            })
          ).status,
          401,
        );
        assert.equal(
          (
            await provider.notify(transaction, {
              timestamp: Math.floor(Date.now() / 1000) - 301,
            })
          ).status,
          401,
        );
        const timestamp = Math.floor(Date.now() / 1000);
        const signature = createHmac("sha512", fixtureSigning)
          .update(String(timestamp) + ".")
          .update(raw)
          .digest("hex");
        assert.equal(
          (
            await provider.notify(transaction, {
              raw: raw + " ",
              signature: `t=${timestamp},v1=whk_fixture:${signature}`,
            })
          ).status,
          401,
        );
        gateway.failNext("audace_payment_record_event");
        assert.equal((await provider.complete(reference)).status, 503);
        assert.equal((await provider.notify(transaction)).status, 200);
        gateway.failNext("audace_payment_apply");
        await due(gateway);
        await worker(origin);
        const pending = await gateway.db.sql(
          "postgres",
          null,
          "select payment_status from audace_orders where id=$1",
          [initialized.orderId],
        );
        assert.equal(pending[0].payment_status, "pending");
        await due(gateway);
        assert.equal((await worker(origin)).status, 200);
        await page.goto(
          origin + `/order-confirmation?order=${initialized.orderId}`,
        );
        await page
          .getByRole("heading", { name: "Payment confirmed." })
          .waitFor();
        assert.equal((await provider.notify(transaction)).status, 200);
        await due(gateway);
        await worker(origin);
        assert.equal(
          (
            await gateway.db.sql(
              "postgres",
              null,
              "select count(*)::int as count from audace_movements where order_id=$1",
              [initialized.orderId],
            )
          )[0].count,
          1,
        );

        const interrupted = input();
        provider.failInitialization("interrupt");
        const interruptedResponse = await initialize(page, origin, interrupted);
        assert.equal(interruptedResponse.status(), 202);
        const uncertain = await interruptedResponse.json();
        const uncertainRef = [...provider.transactions.keys()].at(-1);
        assert.equal(
          (await initialize(page, origin, interrupted)).status(),
          200,
        );
        await provider.complete(uncertainRef);
        await due(gateway);
        await worker(origin);
        await page.goto(
          origin + `/order-confirmation?order=${uncertain.orderId}`,
        );
        await page
          .getByRole("heading", { name: "Payment confirmed." })
          .waitFor();
        assert.equal(provider.transactions.size, 2);
        const timedOut = input();
        provider.failInitialization("timeout");
        const timeoutResponse = await initialize(page, origin, timedOut);
        assert.equal(timeoutResponse.status(), 202);
        const timeoutOrder = await timeoutResponse.json();
        assert.equal((await initialize(page, origin, timedOut)).status(), 200);
        await page.goto(
          origin + `/payment-status?order=${timeoutOrder.orderId}`,
        );
        await page
          .getByRole("heading", { name: "Checking your payment." })
          .waitFor();
        assert.equal(
          await page
            .getByRole("heading", { name: "Payment confirmed." })
            .count(),
          0,
        );
      });
    });
  },
);

test(
  "pending mobile money, verified failure retry and late success use accurate customer states",
  { timeout: 420000 },
  async () => {
    await suite(async ({ gateway, provider, browser, origin }) => {
      await withPage(browser, screenSizes[1], async (page) => {
        const started = await (await initialize(page, origin, input())).json();
        await page.goto(started.authorizationUrl);
        await page
          .getByRole("button", { name: "Return with payment pending" })
          .click();
        await page
          .getByRole("heading", { name: "Checking your payment." })
          .waitFor();
        assert.equal(
          await page
            .getByRole("heading", { name: "Payment confirmed." })
            .count(),
          0,
        );
        const firstRef = [...provider.transactions.keys()][0];
        await provider.complete(firstRef, "failed");
        await gateway.db.sql(
          "postgres",
          null,
          "update audace_payment_attempts set next_verification_at=now()",
        );
        await verify(page, origin, started.orderId);
        await page.reload();
        await page
          .getByRole("heading", { name: "Payment incomplete." })
          .waitFor();
        await page
          .getByRole("button", { name: "Retry payment", exact: true })
          .click();
        await page
          .getByRole("heading", { name: "Synthetic payment gateway" })
          .waitFor();
        await page
          .getByRole("button", { name: "Complete test payment" })
          .click();
        await page.waitForURL("**/order-confirmation?order=**", {
          timeout: 45000,
        });
        await page
          .getByRole("heading", { name: "Payment confirmed." })
          .waitFor();

        const late = await (await initialize(page, origin, input())).json();
        const lateRef = [...provider.transactions.keys()].at(-1);
        await gateway.db.sql(
          "postgres",
          null,
          "update audace_orders set expires_at=now()-interval '1 second' where id=$1",
          [late.orderId],
        );
        await gateway.db.sql(
          "postgres",
          null,
          "update audace_reservations set expires_at=now()-interval '1 second' where order_id=$1",
          [late.orderId],
        );
        await page.goto(origin + `/payment-status?order=${late.orderId}`);
        await page
          .getByRole("heading", { name: "Reservation ended." })
          .waitFor();
        assert.equal(
          await page
            .getByRole("button", { name: "Resume secure checkout" })
            .count(),
          0,
        );
        await provider.complete(lateRef);
        await due(gateway);
        await worker(origin);
        await page.goto(origin + `/payment-status?order=${late.orderId}`);
        await page
          .getByRole("heading", { name: "Your payment is verified." })
          .waitFor();
        await page
          .getByText(
            "The store is reviewing your order before fulfilment. Your payment has been recorded.",
          )
          .waitFor();
        assert.equal(
          await page
            .getByRole("heading", { name: "Payment confirmed." })
            .count(),
          0,
        );
        const order = await gateway.db.sql(
          "postgres",
          null,
          "select payment_status,allocation_status from audace_orders where id=$1",
          [late.orderId],
        );
        assert.equal(order[0].payment_status, "paid");
        assert.equal(order[0].allocation_status, "review");
      });
    });
  },
);
