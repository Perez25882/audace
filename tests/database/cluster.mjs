import { randomBytes } from "node:crypto";
import pg from "pg";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const work = path.join(root, "work");
const binaries = process.env.AUDACE_PG_BIN;
const executable = (name) =>
  binaries
    ? path.join(binaries, process.platform === "win32" ? name + ".exe" : name)
    : name;

function run(name, args, { input, env } = {}) {
  return new Promise((resolve, reject) => {
    const starting = name === "pg_ctl" && args.includes("start");
    const child = spawn(executable(name), args, {
      env: { ...process.env, ...env },
      stdio: starting ? "ignore" : ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "",
      stderr = "";
    child.stdout?.on("data", (data) => {
      stdout += data;
    });
    child.stderr?.on("data", (data) => {
      stderr += data;
    });
    child.stdin?.on("error", () => {
      /* Exit status reports command failures. */
    });
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0
        ? resolve(stdout.trim())
        : reject(new Error(`${name} exited ${code}: ${stderr || stdout}`)),
    );
    child.stdin?.end(input);
  });
}

async function portNumber() {
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

export async function startDatabase() {
  await mkdir(work, { recursive: true });
  const directory = await mkdtemp(path.join(work, "phase-3-pg-"));
  const data = path.join(directory, "data");
  const pwfile = path.join(directory, "pw");
  const password = randomBytes(30).toString("hex");
  const port = await portNumber();
  let started = false;
  let pool;
  async function cleanup() {
    if (pool) await pool.end();
    if (started) await run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
    if (
      path.dirname(path.resolve(directory)) === work &&
      path.basename(directory).startsWith("phase-3-pg-")
    ) {
      await rm(directory, { recursive: true, force: true, maxRetries: 5 });
    }
  }
  const base = [
    "-X",
    "-qAt",
    "-v",
    "ON_ERROR_STOP=1",
    "-h",
    "127.0.0.1",
    "-p",
    String(port),
    "-U",
    "postgres",
    "-d",
    "postgres",
  ];
  const env = {
    PGPASSWORD: password,
    PGCONNECT_TIMEOUT: "30",
    PGOPTIONS: "-c statement_timeout=15000",
  };
  const query = (input, variables = {}) =>
    run(
      "psql",
      [
        ...base,
        ...Object.entries(variables).flatMap(([key, value]) => [
          "-v",
          `${key}=${value}`,
        ]),
        "-f",
        "-",
      ],
      { input, env },
    );
  const file = (filename) =>
    run("psql", [...base, "--single-transaction", "-f", filename], { env });
  const migrations = path.join(root, "supabase", "migrations");
  try {
    await writeFile(pwfile, password + "\n", { mode: 0o600 });
    await run("initdb", [
      "-D",
      data,
      "-U",
      "postgres",
      "-A",
      "scram-sha-256",
      "--pwfile",
      pwfile,
      "--encoding=UTF8",
      "--locale=C",
      "--no-instructions",
    ]);
    await rm(pwfile);
    await run("pg_ctl", [
      "-D",
      data,
      "-l",
      path.join(directory, "postgres.log"),
      "-o",
      `-h 127.0.0.1 -p ${port}`,
      "-w",
      "start",
    ]);
    started = true;
    await file(path.join(root, "tests", "database", "auth-stub.sql"));
    const files = (await readdir(migrations))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    for (const name of files) await file(path.join(migrations, name));
    pool = new pg.Pool({
      host: "127.0.0.1",
      port,
      user: "postgres",
      password,
      database: "postgres",
      max: 8,
      statement_timeout: 15000,
    });
    const sql = async (role, subject, text, values = []) => {
      if (!["anon", "authenticated", "service_role", "postgres"].includes(role))
        throw new Error("Invalid test role");
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query(`set local role ${role}`);
        await client.query(
          "select set_config('request.jwt.claim.sub',$1,true)",
          [subject ?? ""],
        );
        const result = await client.query(text, values);
        await client.query("commit");
        return result.rows;
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    };
    const rpc = async (role, subject, name, args = {}) => {
      if (!/^audace_[a-z0-9_]+$/.test(name))
        throw new Error("Invalid test RPC");
      const entries = Object.entries(args);
      if (entries.some(([key]) => !/^p_[a-z0-9_]+$/.test(key)))
        throw new Error("Invalid test argument");
      const placeholders = entries
        .map(([key], index) => key + " => $" + String(index + 1))
        .join(",");
      const values = entries.map(([, value]) =>
        value !== null && typeof value === "object"
          ? JSON.stringify(value)
          : value,
      );
      const rows = await sql(
        role,
        subject,
        `select public.${name}(${placeholders}) as result`,
        values,
      );
      return rows[0].result;
    };
    return {
      query,
      rpc,
      sql,
      file,
      cleanup,
      reseed: () =>
        file(path.join(migrations, "20261107000400_locked_catalogue.sql")),
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
