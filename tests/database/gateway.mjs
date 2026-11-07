import { createHmac, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { startDatabase } from "./cluster.mjs";

const fixtureUsers = {
  "owner@example.test": "20000000-0000-4000-8000-000000000001",
  "operator@example.test": "20000000-0000-4000-8000-000000000002",
  "customer@example.test": "20000000-0000-4000-8000-000000000003",
};

export async function withShopGateway(run) {
  const db = await startDatabase();
  const sessions = new Map();
  const signingKey = randomBytes(32);
  let unavailable = false;
  const failures = new Map();
  const server = createServer(async (request, response) => {
    const send = (status, data) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(data === undefined ? undefined : JSON.stringify(data));
    };
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      const auth = request.headers.authorization?.replace(/^Bearer /, "");
      const user = sessions.get(auth);
      let body = "";
      for await (const chunk of request) body += chunk;
      const input = body ? JSON.parse(body) : {};
      if (url.pathname === "/auth/v1/token") {
        if (
          !Object.hasOwn(fixtureUsers, input.email) ||
          input.password !== "Synthetic test password"
        )
          return send(400, {
            error_code: "invalid_credentials",
            msg: "Invalid credentials",
          });
        const account = {
          id: fixtureUsers[input.email],
          email: input.email,
          aud: "authenticated",
          role: "authenticated",
          app_metadata: {},
          user_metadata: {},
          created_at: "2026-01-01T00:00:00Z",
        };
        const exp = Math.floor(Date.now() / 1000) + 3600;
        const header = Buffer.from(
          JSON.stringify({ alg: "HS256", typ: "JWT" }),
        ).toString("base64url");
        const claims = Buffer.from(
          JSON.stringify({
            sub: account.id,
            exp,
            aud: account.aud,
            role: account.role,
            jti: randomBytes(8).toString("hex"),
          }),
        ).toString("base64url");
        const token = `${header}.${claims}.${createHmac("sha256", signingKey).update(`${header}.${claims}`).digest("base64url")}`;
        sessions.set(token, account);
        return send(200, {
          access_token: token,
          refresh_token: randomBytes(16).toString("hex"),
          token_type: "bearer",
          expires_in: 3600,
          expires_at: exp,
          user: account,
        });
      }
      if (url.pathname === "/auth/v1/user")
        return user
          ? send(200, user)
          : send(401, { error_code: "bad_jwt", msg: "Missing session" });
      if (url.pathname === "/auth/v1/logout") {
        sessions.delete(auth);
        return send(204);
      }
      const role =
        auth === "fixture-service-role"
          ? "service_role"
          : user
            ? "authenticated"
            : "anon";
      const sendRows = (rows) =>
        send(
          200,
          request.headers.accept?.includes("application/vnd.pgrst.object")
            ? (rows[0] ?? null)
            : rows,
        );
      const match = /^\/rest\/v1\/rpc\/(audace_[a-z0-9_]+)$/.exec(url.pathname);
      if (match && request.method === "POST") {
        if (match[1] === "audace_public_shop" && unavailable)
          return send(503, { message: "Fixture outage" });
        const remaining = failures.get(match[1]) ?? 0;
        if (remaining > 0) {
          failures.set(match[1], remaining - 1);
          return send(503, { message: "Synthetic database interruption" });
        }
        const result = await db.rpc(role, user?.id, match[1], input);
        return result === null || result === ""
          ? send(200, result ?? null)
          : send(200, result);
      }
      if (url.pathname === "/rest/v1/audace_movements") {
        if (!user) return send(401, { message: "Unauthorized" });
        const rows = await db.sql(
          role,
          user.id,
          "select m.id,m.delta,m.balance,m.reason,m.created_at,m.actor,jsonb_build_object('code',s.code) as audace_skus from audace_movements m join audace_skus s on s.id=m.sku_id order by m.id desc limit 40",
        );
        return send(200, rows);
      }
      if (url.pathname === "/rest/v1/audace_payment_attempts") {
        if (!user) return send(401, { message: "Unauthorized" });
        return send(
          200,
          await db.sql(
            role,
            user.id,
            "select a.*,jsonb_build_object('id',o.id,'public_ref',o.public_ref,'payment_status',o.payment_status,'allocation_status',o.allocation_status,'financial_review',o.financial_review) as audace_orders from audace_payment_attempts a join audace_orders o on o.id=a.order_id order by a.created_at desc limit 51",
          ),
        );
      }
      if (
        request.method === "GET" &&
        url.pathname.startsWith("/rest/v1/audace_")
      ) {
        if (!user) return send(401, { message: "Unauthorized" });
        const table = url.pathname.split("/").at(-1);
        const orderId =
          url.searchParams.get("order_id")?.replace(/^eq\./, "") ??
          url.searchParams.get("id")?.replace(/^eq\./, "") ??
          null;
        if (table === "audace_products")
          return sendRows(
            await db.sql(
              role,
              user.id,
              `select p.*,
          (select coalesce(jsonb_agg(to_jsonb(v) || jsonb_build_object(
            'audace_images',(select coalesce(jsonb_agg(i),'[]') from audace_images i where i.variant_id=v.id),
            'audace_skus',(select coalesce(jsonb_agg(s),'[]') from audace_skus s where s.variant_id=v.id)) order by v.sort_order),'[]')
            from audace_variants v where v.product_id=p.id) as audace_variants
          from audace_products p order by p.name`,
            ),
          );
        if (table === "audace_delivery" || table === "audace_settings")
          return sendRows(
            await db.sql(role, user.id, "select * from " + table),
          );
        if (table === "audace_orders")
          return sendRows(
            await db.sql(
              role,
              user.id,
              "select * from audace_orders where ($1::uuid is null or id=$1) order by created_at desc limit 51",
              [orderId],
            ),
          );
        if (
          [
            "audace_order_contacts",
            "audace_order_items",
            "audace_order_history",
          ].includes(table)
        )
          return sendRows(
            await db.sql(
              role,
              user.id,
              "select * from " + table + " where order_id=$1",
              [orderId],
            ),
          );
      }
      return send(404, { message: "Unknown fixture endpoint" });
    } catch (error) {
      return send(400, {
        message:
          error instanceof Error
            ? error.message
            : "The fixture request was rejected",
        code: error?.code ?? "P0001",
      });
    }
  });
  try {
    await db.file(
      fileURLToPath(new URL("./shop-fixture.sql", import.meta.url)),
    );
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    return await run({
      url: `http://127.0.0.1:${server.address().port}`,
      db,
      expireSessions: () => sessions.clear(),
      setOutage: (value) => {
        unavailable = value;
      },
      failNext: (name, count = 1) => failures.set(name, count),
      setPrice: (price) =>
        db.query(
          "update audace_variants set price_pesewas=:'price' where id='audace-cr-ss';",
          { price },
        ),
    });
  } finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    await db.cleanup();
  }
}
