import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const forbidden = [
  "/.local-credentials/",
  "/.claude/",
  "/.mcp.json",
  "/.newsletter-output/",
  "/.newsletter-drafts/",
  "/.newsletter-chart-library/",
  "/.why-moved-reviews/",
  "/.artifacts/",
  "/coverage/",
  "/video_lessons/",
];
const operationsSnapshotForbidden = [
  "/node_modules/puppeteer/",
  "/node_modules/puppeteer-core/",
  "/node_modules/@puppeteer/",
  "/node_modules/typescript/",
  "/data/",
  "/dexter/",
  "/scripts/",
  "/.vercel/project.json",
];
export const homePageTracePolicy = {
  label: "Public home page",
  maxFiles: 150,
  maxBytes: 5 * 1024 * 1024,
  allowedPaths: ["/data/sp500-constituents.json"],
  forbidden: [
    "/node_modules/puppeteer/",
    "/node_modules/puppeteer-core/",
    "/node_modules/@puppeteer/",
    "/node_modules/typescript/",
    "/data/",
    "/test-data/",
    "/scripts/",
    "/.git/",
    "/.vercel/",
    "/.artifacts/",
    "/lib/newsletter/capture.",
    "/lib/newsletter/charting-platform-export.",
    "/lib/newsletter/daily-automation.",
    "/lib/newsletter/daily-draft.",
    "/lib/newsletter/daily-runs.",
    "/lib/newsletter/drafts.",
    "/lib/newsletter/generation.",
    "/lib/newsletter/orchestrate.",
  ],
};
export const dailyRunsGetTracePolicy = {
  label: "Newsletter Daily Runs GET",
  maxFiles: 150,
  maxBytes: 5 * 1024 * 1024,
  forbidden: [
    "/node_modules/puppeteer/",
    "/node_modules/puppeteer-core/",
    "/node_modules/@puppeteer/",
    "/node_modules/typescript/",
    "/data/",
    "/test-data/",
    "/scripts/",
    "/.git/",
    "/.vercel/",
    "/.artifacts/",
    "/lib/generated-stock-why-moving.",
    "/lib/newsletter/beehiiv-delivery.",
    "/lib/newsletter/capture.",
    "/lib/newsletter/chart-library.",
    "/lib/newsletter/charting-platform-export.",
    "/lib/newsletter/daily-automation.",
    "/lib/newsletter/daily-draft.",
    "/lib/newsletter/daily-runs.",
    "/lib/newsletter/drafts.",
    "/lib/newsletter/generation.",
    "/lib/newsletter/orchestrate.",
  ],
};
export const whyMovedAdminPageTracePolicy = {
  label: "Why Moved admin page",
  maxFiles: 150,
  maxBytes: 5 * 1024 * 1024,
  forbidden: [
    "/node_modules/@puppeteer/",
    "/node_modules/puppeteer/",
    "/node_modules/puppeteer-core/",
    "/node_modules/openai/",
    "/node_modules/typescript/",
    "/node_modules/tsx/",
    "/data/",
    "/test-data/",
    "/scripts/",
    "/.git/",
    "/.vercel/",
    "/.artifacts/",
    "/package-lock.json",
    "/app/actions/market-movers.",
    "/app/actions/why-moved-review.",
    "/lib/generated-stock-why-moving.",
    "/lib/stock-why-moving.",
    "/lib/newsletter/catalyst-workflow.",
    "/lib/newsletter/capture.",
    "/lib/newsletter/chart-editor.",
    "/lib/newsletter/chart-library.",
    "/lib/newsletter/charting-platform-export.",
    "/lib/newsletter/daily-automation.",
    "/lib/newsletter/daily-draft.",
    "/lib/newsletter/daily-runs.",
    "/lib/newsletter/drafts.",
    "/lib/newsletter/generation.",
    "/lib/newsletter/local-worker.",
    "/lib/newsletter/orchestrate.",
    "/lib/newsletter/publish.",
    "/lib/newsletter/resolve-chart.",
  ],
};

async function listTraceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listTraceFiles(path)));
    else if (entry.name.endsWith(".nft.json")) files.push(path);
  }
  return files;
}

export function assertBoundedTrace({ tracePath, files, tracedBytes, policy }) {
  const traceLabel = relative(process.cwd(), tracePath);
  if (files.length > policy.maxFiles) {
    throw new Error(
      `${policy.label} trace unexpectedly contains ${files.length} files`,
    );
  }
  for (const tracedFile of files) {
    const normalized = `/${String(tracedFile).replaceAll("\\", "/")}`;
    const explicitlyAllowed = policy.allowedPaths?.some((path) =>
      normalized.endsWith(path),
    );
    if (explicitlyAllowed) continue;
    const match = policy.forbidden.find((segment) =>
      normalized.includes(segment),
    );
    if (match) {
      throw new Error(
        `${traceLabel} contains ${policy.label.toLowerCase()}-forbidden path ${match}`,
      );
    }
  }
  if (tracedBytes > policy.maxBytes) {
    throw new Error(
      `${policy.label} trace unexpectedly totals ${tracedBytes} bytes`,
    );
  }
}

export function assertHomeTraceSeen(homeTraceSeen) {
  if (!homeTraceSeen) {
    throw new Error(
      "Production build emitted no public home trace at app/page.js.nft.json",
    );
  }
}

export function assertDailyRunsGetTraceSeen(dailyRunsGetTraceSeen) {
  if (!dailyRunsGetTraceSeen) {
    throw new Error(
      "Production build emitted no Newsletter Daily Runs GET trace at app/api/newsletter/daily-runs/route.js.nft.json",
    );
  }
}

export function assertWhyMovedAdminPageTraceSeen(whyMovedAdminPageTraceSeen) {
  if (!whyMovedAdminPageTraceSeen) {
    throw new Error(
      "Production build emitted no Why Moved admin page trace at app/admin/why-moved/page.js.nft.json",
    );
  }
}

async function getTracedBytes(tracePath, files) {
  let tracedBytes = 0;
  for (const tracedFile of files) {
    tracedBytes += (await stat(resolve(dirname(tracePath), String(tracedFile))))
      .size;
  }
  return tracedBytes;
}

export async function verifyBuildTraces(cwd = process.cwd()) {
  const traceRoot = join(cwd, ".next", "server");
  const traceFiles = await listTraceFiles(traceRoot);
  if (traceFiles.length === 0) {
    throw new Error("Production build emitted no server trace files");
  }

  let homeTraceSeen = false;
  let dailyRunsGetTraceSeen = false;
  let whyMovedAdminPageTraceSeen = false;
  for (const tracePath of traceFiles) {
    const trace = JSON.parse(await readFile(tracePath, "utf8"));
    const files = Array.isArray(trace.files) ? trace.files : [];
    for (const tracedFile of files) {
      const normalized = `/${String(tracedFile).replaceAll("\\", "/")}`;
      const match = forbidden.find((segment) => normalized.includes(segment));
      if (match) {
        throw new Error(
          `${relative(cwd, tracePath)} contains forbidden local path ${match}`,
        );
      }
    }

    if (
      tracePath.endsWith(
        join(
          "app",
          "api",
          "health",
          "dashboard-commentary",
          "route.js.nft.json",
        ),
      ) &&
      files.length > 200
    ) {
      throw new Error(
        `Dashboard commentary health trace unexpectedly contains ${files.length} files`,
      );
    }

    if (
      tracePath.endsWith(
        join("app", "api", "newsletter", "operations", "route.js.nft.json"),
      )
    ) {
      if (files.length > 150) {
        throw new Error(
          `Newsletter Operations snapshot trace unexpectedly contains ${files.length} files`,
        );
      }
      for (const tracedFile of files) {
        const normalized = `/${String(tracedFile).replaceAll("\\", "/")}`;
        const match = operationsSnapshotForbidden.find((segment) =>
          normalized.includes(segment),
        );
        if (match) {
          throw new Error(
            `${relative(cwd, tracePath)} contains snapshot-forbidden path ${match}`,
          );
        }
      }
      const tracedBytes = await getTracedBytes(tracePath, files);
      if (tracedBytes > 5 * 1024 * 1024) {
        throw new Error(
          `Newsletter Operations snapshot trace unexpectedly totals ${tracedBytes} bytes`,
        );
      }
    }

    if (tracePath.endsWith(join("app", "page.js.nft.json"))) {
      homeTraceSeen = true;
      assertBoundedTrace({
        tracePath,
        files,
        tracedBytes: await getTracedBytes(tracePath, files),
        policy: homePageTracePolicy,
      });
    }

    if (
      tracePath.endsWith(
        join("app", "api", "newsletter", "daily-runs", "route.js.nft.json"),
      )
    ) {
      dailyRunsGetTraceSeen = true;
      assertBoundedTrace({
        tracePath,
        files,
        tracedBytes: await getTracedBytes(tracePath, files),
        policy: dailyRunsGetTracePolicy,
      });
    }

    if (
      relative(traceRoot, tracePath) ===
      join("app", "admin", "why-moved", "page.js.nft.json")
    ) {
      whyMovedAdminPageTraceSeen = true;
      assertBoundedTrace({
        tracePath,
        files,
        tracedBytes: await getTracedBytes(tracePath, files),
        policy: whyMovedAdminPageTracePolicy,
      });
    }
  }

  assertHomeTraceSeen(homeTraceSeen);
  assertDailyRunsGetTraceSeen(dailyRunsGetTraceSeen);
  assertWhyMovedAdminPageTraceSeen(whyMovedAdminPageTraceSeen);

  console.log(`Verified ${traceFiles.length} server build traces.`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await verifyBuildTraces();
}
