import { spawn } from "node:child_process";
import path from "node:path";
const npm = process.env.npm_execpath;
if (!npm) throw new Error("Run this workflow with npm run verify");
const major = Number(process.versions.node.split(".")[0]);
if (major !== 22)
  throw new Error("Use the verified Node.js 22 branch recorded in .nvmrc");
for (const script of [
  "lint",
  "typecheck",
  "test",
  "test:db",
  "build",
  "test:e2e",
  "test:qa",
]) {
  console.log("\nAUDACE release check: " + script);
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve(npm), "run", script], {
      stdio: "inherit",
      windowsHide: true,
      env: process.env,
    });
    child.once("error", reject);
    child.once("close", resolve);
  });
  if (exitCode !== 0) process.exit(Number(exitCode) || 1);
}
