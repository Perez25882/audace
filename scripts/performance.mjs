import lighthouse from "lighthouse";
import { launch } from "chrome-launcher";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright-core";
import { withServer, root, work } from "../tests/browser-runtime.mjs";

const runs = Number(process.env.AUDACE_PERF_RUNS ?? 3);
if (![1, 2, 3].includes(runs))
  throw new Error("AUDACE_PERF_RUNS must be 1, 2 or 3");
const label =
  process.env.AUDACE_PERF_LABEL === "baseline" ? "baseline" : "final";
const directory = path.join(work, "phase-5-performance-" + label);
await mkdir(directory, { recursive: true });
await withServer(root, async (origin) => {
  const profile = path.join(work, "lighthouse-profile-" + randomUUID());
  await mkdir(profile, { recursive: true });
  const chrome = await launch({
    chromeFlags: ["--headless=new", "--disable-gpu", "--no-first-run"],
    userDataDir: profile,
  });
  const results = [];
  try {
    for (const route of ["/", "/products/burgundy-short-sleeve"]) {
      for (let run = 1; run <= runs; run++) {
        const report = await lighthouse(origin + route, {
          port: chrome.port,
          output: "json",
          logLevel: "error",
          onlyCategories: [
            "performance",
            "accessibility",
            "best-practices",
            "seo",
          ],
          formFactor: "mobile",
          screenEmulation: {
            mobile: true,
            width: 390,
            height: 844,
            deviceScaleFactor: 1,
            disabled: false,
          },
        });
        if (!report?.lhr || report.lhr.runtimeError)
          throw new Error(
            "Lighthouse did not complete: " +
              JSON.stringify(report?.lhr.runtimeError),
          );
        const lhr = report.lhr;
        const row = {
          route,
          run,
          performance: lhr.categories.performance.score,
          accessibility: lhr.categories.accessibility.score,
          bestPractices: lhr.categories["best-practices"].score,
          seo: lhr.categories.seo.score,
          lcpMs: lhr.audits["largest-contentful-paint"].numericValue,
          cls: lhr.audits["cumulative-layout-shift"].numericValue,
          tbtMs: lhr.audits["total-blocking-time"].numericValue,
          transferBytes: lhr.audits["total-byte-weight"].numericValue,
          environment: lhr.environment,
          settings: lhr.configSettings,
          node: process.version,
          lighthouse: lhr.lighthouseVersion,
        };
        results.push(row);
        await writeFile(
          path.join(
            directory,
            (route === "/" ? "home" : "product") + "-" + run + ".json",
          ),
          JSON.stringify(lhr),
        );
        console.log(
          JSON.stringify({
            route,
            run,
            performance: row.performance,
            lcpMs: Math.round(row.lcpMs),
            cls: row.cls,
            tbtMs: Math.round(row.tbtMs),
            transferBytes: row.transferBytes,
          }),
        );
      }
    }
    await writeFile(
      path.join(directory, "summary.json"),
      JSON.stringify(
        {
          condition:
            "Local production build; unconfigured illustrative catalogue; Lighthouse simulated mobile throttling; not real-user/device measurements. TBT is not INP.",
          results,
        },
        null,
        2,
      ),
    );
  } finally {
    await chrome.kill();
  }
  const browser = await chromium.launch({
    channel: process.env.AUDACE_TEST_BROWSER || "chrome",
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.addInitScript(() => {
      window.__audaceTimings = [];
      if (PerformanceObserver.supportedEntryTypes.includes("event")) {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            if (entry.interactionId)
              window.__audaceTimings.push(entry.duration);
        }).observe({ type: "event", durationThreshold: 16, buffered: true });
      }
    });
    const interactions = [];
    for (const route of ["/", "/products/burgundy-short-sleeve"]) {
      await page.goto(origin + route);
      if (route === "/") {
        for (const name of ["Long sleeve", "Short sleeve", "All styles"])
          await page.getByRole("button", { name, exact: true }).click();
      } else {
        await page.getByRole("button", { name: "Zoom image" }).click();
        await page.getByRole("button", { name: "Close image" }).click();
      }
      await page.waitForTimeout(500); // Allow Event Timing's asynchronous reporting to flush.
      const durations = await page.evaluate(() => window.__audaceTimings);
      interactions.push({
        route,
        samples: durations.length,
        maxReportedEventMs: durations.length ? Math.max(...durations) : null,
        reportingThresholdMs: 16,
      });
    }
    await writeFile(
      path.join(directory, "interactions.json"),
      JSON.stringify(
        {
          condition:
            "Chromium 390x844; 4x CDP CPU throttling; a few lab interactions only, not field INP",
          interactions,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
});
