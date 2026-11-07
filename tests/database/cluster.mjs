import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const work = path.join(root, "work");
const binaries = process.env.AUDACE_PG_BIN;
const executable = (name) => binaries ? path.join(binaries, process.platform === "win32" ? name + ".exe" : name) : name;

function run(name, args, { input, env } = {}) {
  return new Promise((resolve, reject) => {
    const starting = name === "pg_ctl" && args.includes("start");
    const child = spawn(executable(name), args, { env: { ...process.env, ...env }, stdio: starting ? "ignore" : ["pipe","pipe","pipe"], windowsHide: true });
    let stdout = "", stderr = "";
    child.stdout?.on("data", (data) => { stdout += data; });
    child.stderr?.on("data", (data) => { stderr += data; });
    child.stdin?.on("error", () => { /* Exit status reports command failures. */ });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(`${name} exited ${code}: ${stderr || stdout}`)));
    child.stdin?.end(input);
  });
}

async function portNumber() {
  const socket = createServer();
  await new Promise((resolve, reject) => { socket.once("error", reject); socket.listen(0,"127.0.0.1",resolve); });
  const port = socket.address().port;
  await new Promise((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  return port;
}

export async function startDatabase() {
  await mkdir(work,{ recursive:true });
  const directory = await mkdtemp(path.join(work,"phase-3-pg-"));
  const data = path.join(directory,"data");
  const pwfile = path.join(directory,"pw");
  const password = randomBytes(30).toString("hex");
  const port = await portNumber();
  let started = false;
  async function cleanup() {
    if (started) await run("pg_ctl",["-D",data,"-m","fast","-w","stop"]);
    if (path.dirname(path.resolve(directory)) === work && path.basename(directory).startsWith("phase-3-pg-")) {
      await rm(directory,{ recursive:true,force:true,maxRetries:5 });
    }
  }
  const base = ["-X","-qAt","-v","ON_ERROR_STOP=1","-h","127.0.0.1","-p",String(port),"-U","postgres","-d","postgres"];
  const env = { PGPASSWORD: password, PGCONNECT_TIMEOUT: "5", PGOPTIONS: "-c statement_timeout=15000" };
  const query = (input, variables = {}) => run("psql",[
    ...base, ...Object.entries(variables).flatMap(([key,value]) => ["-v",`${key}=${value}`]), "-f","-",
  ],{ input,env });
  const file = (filename) => run("psql",[...base,"--single-transaction","-f",filename],{ env });
  const migrations = path.join(root,"supabase","migrations");
  try {
    await writeFile(pwfile,password + "\n",{ mode:0o600 });
    await run("initdb",["-D",data,"-U","postgres","-A","scram-sha-256","--pwfile",pwfile,"--encoding=UTF8","--locale=C","--no-instructions"]);
    await rm(pwfile);
    await run("pg_ctl",["-D",data,"-l",path.join(directory,"postgres.log"),"-o",`-h 127.0.0.1 -p ${port}`,"-w","start"]);
    started = true;
    await file(path.join(root,"tests","database","auth-stub.sql"));
    const files = (await readdir(migrations)).filter((name) => name.endsWith(".sql")).sort();
    for (const name of files) await file(path.join(migrations,name));
    return { query, file, cleanup, reseed: () => file(path.join(migrations,files.at(-1))) };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
