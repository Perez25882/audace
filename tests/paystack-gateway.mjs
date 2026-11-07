import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { createServer } from "node:http";

// Each isolated gateway uses disposable local values, never merchant credentials.
export const fixtureSecret = `sk_test_${randomBytes(24).toString("hex")}`;
export const fixtureSigning = `whsec_${randomBytes(24).toString("hex")}`;
export const fixtureWorker =
  "synthetic-reconciliation-secret-more-than-32-characters";

export async function withPaystack(run) {
  const transactions = new Map();
  let nextId = BigInt("9223372036854700000");
  let initializeFailure = null;
  let verificationFailure = false;
  let initCalls = 0;
  let base = "";
  let app = "";
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, base);
    const send = (status, data) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(data));
    };
    if (url.pathname.startsWith("/checkout/")) {
      const reference = url.pathname.slice("/checkout/".length);
      const transaction = transactions.get(reference);
      if (!transaction) return send(404, { status: false });
      if (request.method === "POST") {
        let body = "";
        for await (const chunk of request) body += chunk;
        const state = new URLSearchParams(body).get("state");
        if (state === "success" || state === "failed" || state === "abandoned")
          transaction.status = state;
        if (state === "success") {
          transaction.paid_at = new Date().toISOString();
          await notify(transaction);
        }
        const callback = new URL(transaction.callback);
        callback.searchParams.set("reference", reference);
        response.writeHead(303, { location: callback.href });
        return response.end();
      }
      response.writeHead(200, { "content-type": "text/html" });
      return response.end(
        '<!doctype html><html lang="en"><title>Synthetic Paystack checkout</title><body><h1>Synthetic payment gateway</h1><form method="post"><button name="state" value="success">Complete test payment</button><button name="state" value="pending">Return with payment pending</button><button name="state" value="failed">Fail test payment</button><button name="state" value="abandoned">Abandon test payment</button></form></body></html>',
      );
    }
    if (request.headers.authorization !== `Bearer ${fixtureSecret}`)
      return send(401, { status: false });
    if (
      url.pathname === "/transaction/initialize" &&
      request.method === "POST"
    ) {
      let body = "";
      for await (const chunk of request) body += chunk;
      const input = JSON.parse(body);
      initCalls++;
      assert.equal(input.currency, "GHS");
      assert.equal(input.amount, "41245");
      assert.deepEqual(input.channels, ["card", "mobile_money"]);
      if (initializeFailure === "error") {
        initializeFailure = null;
        return send(503, { status: false });
      }
      let transaction = transactions.get(input.reference);
      if (!transaction) {
        transaction = {
          id: String(++nextId),
          domain: "test",
          reference: input.reference,
          amount: Number(input.amount),
          currency: "GHS",
          status: "pending",
          paid_at: null,
          channel: "mobile_money",
          customer: { email: input.email },
          metadata: JSON.parse(input.metadata),
          callback: input.callback_url,
        };
        transactions.set(input.reference, transaction);
      }
      if (initializeFailure === "interrupt") {
        initializeFailure = null;
        request.socket.destroy();
        return;
      }
      if (initializeFailure === "timeout") {
        initializeFailure = null;
        const timer = setTimeout(() => send(503, { status: false }), 15_000);
        response.once("close", () => clearTimeout(timer));
        return;
      }
      return send(200, {
        status: true,
        data: {
          authorization_url: `${base}/checkout/${input.reference}`,
          access_code: "synthetic",
          reference: input.reference,
        },
      });
    }
    if (url.pathname.startsWith("/transaction/verify/")) {
      if (verificationFailure) {
        verificationFailure = false;
        return send(503, { status: false });
      }
      const transaction = transactions.get(
        decodeURIComponent(url.pathname.slice("/transaction/verify/".length)),
      );
      return transaction
        ? send(200, { status: true, data: transaction })
        : send(404, { status: false });
    }
    return send(404, { status: false });
  });

  function rawEvent(transaction, type = "charge.success") {
    return JSON.stringify({
      event: type,
      data: {
        id: transaction.id,
        domain: "test",
        reference: transaction.reference,
        status: transaction.status,
        amount: transaction.amount,
        currency: "GHS",
      },
    });
  }
  async function notify(transaction, options = {}) {
    const raw = options.raw ?? rawEvent(transaction);
    const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
    const hex = createHmac("sha512", fixtureSigning)
      .update(String(timestamp) + ".")
      .update(raw)
      .digest("hex");
    return fetch(app + "/api/payments/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Paystack-Signature":
          options.signature ?? `t=${timestamp},v1=whk_fixture:${hex}`,
      },
      body: raw,
    });
  }
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
    return await run({
      url: base,
      transactions,
      configureApp: (origin) => {
        app = origin;
      },
      calls: () => initCalls,
      failInitialization: (mode) => {
        initializeFailure = mode;
      },
      failVerification: () => {
        verificationFailure = true;
      },
      notify,
      complete: async (reference, status = "success") => {
        const transaction = transactions.get(reference);
        transaction.status = status;
        if (status === "success") {
          transaction.paid_at = new Date().toISOString();
          return notify(transaction);
        }
      },
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
