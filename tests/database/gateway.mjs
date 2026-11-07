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
  const server = createServer(async (request,response) => {
    const send = (status, data) => {
      response.writeHead(status,{ "content-type":"application/json" });
      response.end(data === undefined ? undefined : JSON.stringify(data));
    };
    try {
      const url = new URL(request.url,"http://127.0.0.1");
      const auth = request.headers.authorization?.replace(/^Bearer /,"");
      const user = sessions.get(auth);
      let body = "";
      for await (const chunk of request) body += chunk;
      const input = body ? JSON.parse(body) : {};
      switch (url.pathname) {
        case "/auth/v1/token": {
          if (!Object.hasOwn(fixtureUsers,input.email) || input.password !== "Synthetic test password") {
            return send(400,{ error_code:"invalid_credentials", msg:"Invalid credentials" });
          }
          const account = { id:fixtureUsers[input.email],email:input.email,aud:"authenticated",role:"authenticated",
            app_metadata:{},user_metadata:{},created_at:"2026-01-01T00:00:00Z" };
          const exp = Math.floor(Date.now()/1000) + 3600;
          const header = Buffer.from(JSON.stringify({ alg:"HS256",typ:"JWT" })).toString("base64url");
          const claims = Buffer.from(JSON.stringify({ sub:account.id,exp,aud:account.aud,role:account.role,jti:randomBytes(8).toString("hex") })).toString("base64url");
          const signature = createHmac("sha256",signingKey).update(`${header}.${claims}`).digest("base64url");
          const token = `${header}.${claims}.${signature}`;
          sessions.set(token,account);
          return send(200,{ access_token:token,refresh_token:randomBytes(16).toString("hex"),token_type:"bearer",
            expires_in:3600,expires_at:exp,user:account });
        }
        case "/auth/v1/user":
          return user ? send(200,user) : send(401,{ error_code:"bad_jwt", msg:"Missing or invalid session" });
        case "/auth/v1/logout":
          sessions.delete(auth);
          return send(204);
        case "/rest/v1/rpc/audace_public_shop":
          if (unavailable) return send(503,{ message:"Fixture outage" });
          return send(200,JSON.parse(await db.query("set role anon; select audace_public_shop();")));
        case "/rest/v1/rpc/audace_checkout_quote":
          return send(200,JSON.parse(await db.query("set role anon; select audace_checkout_quote(:'lines',:'region',:'delivery');",{
            lines:JSON.stringify(input.p_lines),region:input.p_region,delivery:input.p_delivery,
          })));
        case "/rest/v1/rpc/audace_admin_inventory":
          if (!user) return send(401,{ message:"Unauthorized" });
          return send(200,JSON.parse(await db.query("set role authenticated; set request.jwt.claim.sub = :'subject'; select audace_admin_inventory(:'search',:'filter',:'offset');",{
            subject:user.id,search:input.p_search,filter:input.p_filter,offset:input.p_offset,
          })));
        case "/rest/v1/rpc/audace_adjust_stock":
          if (!user) return send(401,{ message:"Unauthorized" });
          await db.query("set role authenticated; set request.jwt.claim.sub = :'subject'; select audace_adjust_stock(:'id',:'expected',:'count',:'reason');",{
            subject:user.id,id:input.p_sku,expected:input.p_expected,count:input.p_count,reason:input.p_reason,
          });
          return send(204);
        case "/rest/v1/audace_movements":
          if (!user) return send(401,{ message:"Unauthorized" });
          return send(200,JSON.parse(await db.query("set role authenticated; set request.jwt.claim.sub = :'subject'; select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select m.id,m.delta,m.balance,m.reason,m.created_at,m.actor,jsonb_build_object('code',s.code) as audace_skus from audace_movements m join audace_skus s on s.id=m.sku_id order by m.id desc limit 40) x;",{subject:user.id})));
        case "/rest/v1/rpc/audace_admin_role":
        case "/rest/v1/rpc/audace_admin_metrics": {
          if (!user) return send(401,{ message:"Unauthorized" });
          const functionName = url.pathname.endsWith("role") ? "audace_admin_role" : "audace_admin_metrics";
          const value = await db.query(`set role authenticated; set request.jwt.claim.sub = :'subject'; select ${functionName}();`,{subject:user.id});
          return send(200,functionName.endsWith("role") ? value || null : JSON.parse(value));
        }
        default: return send(404,{ message:"Unknown fixture endpoint" });
      }
    } catch {
      return send(400,{ message:"The fixture request was rejected" });
    }
  });
  try {
    await db.file(fileURLToPath(new URL("./shop-fixture.sql",import.meta.url)));
    await new Promise((resolve,reject) => { server.once("error",reject); server.listen(0,"127.0.0.1",resolve); });
    return await run({
      url:`http://127.0.0.1:${server.address().port}`,
      setOutage: (value) => { unavailable = value; },
      setPrice: (price) => db.query("update audace_variants set price_pesewas=:'price' where id='audace-cr-ss';",{price}),
    });
  } finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    await db.cleanup();
  }
}
