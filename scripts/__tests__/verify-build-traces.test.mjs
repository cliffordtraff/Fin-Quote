import { describe, expect, it } from "vitest";

import {
  assertBoundedTrace,
  assertDailyRunsGetTraceSeen,
  assertHomeTraceSeen,
  assertWhyMovedAdminPageTraceSeen,
  dailyRunsGetTracePolicy,
  homePageTracePolicy,
  whyMovedAdminPageTracePolicy,
} from "../verify-build-traces.mjs";

const tracePath = "/workspace/.next/server/app/page.js.nft.json";

describe("public home build trace policy", () => {
  it.each([
    "../../../node_modules/puppeteer-core/lib/cjs/puppeteer.js",
    "../../../node_modules/typescript/lib/typescript.js",
    "../../../data/backups/company.json",
    "../../../test-data/evals.json",
    "../../../scripts/evaluate.ts",
    "../../../.artifacts/private-eval.json",
    "../../../lib/newsletter/daily-automation.js",
    "../../../lib/newsletter/generation.js",
  ])("rejects a heavy or local path: %s", (forbiddenPath) => {
    expect(() =>
      assertBoundedTrace({
        tracePath,
        files: [forbiddenPath],
        tracedBytes: 1,
        policy: homePageTracePolicy,
      }),
    ).toThrow(/forbidden path/);
  });

  it("allows only the public S&P constituent projection required by the home catalyst feed", () => {
    expect(() =>
      assertBoundedTrace({
        tracePath,
        files: ["../../../data/sp500-constituents.json"],
        tracedBytes: 149_855,
        policy: homePageTracePolicy,
      }),
    ).not.toThrow();

    expect(() =>
      assertBoundedTrace({
        tracePath,
        files: ["../../../data/backups/sp500-constituents.json"],
        tracedBytes: 149_855,
        policy: homePageTracePolicy,
      }),
    ).toThrow(/forbidden path/);
  });

  it("rejects a home trace over the file budget", () => {
    expect(() =>
      assertBoundedTrace({
        tracePath,
        files: Array.from(
          { length: homePageTracePolicy.maxFiles + 1 },
          (_, index) => `../../../node_modules/example-${index}.js`,
        ),
        tracedBytes: 1,
        policy: homePageTracePolicy,
      }),
    ).toThrow("151 files");
  });

  it("rejects a home trace over the byte budget", () => {
    expect(() =>
      assertBoundedTrace({
        tracePath,
        files: ["../../../node_modules/example/index.js"],
        tracedBytes: homePageTracePolicy.maxBytes + 1,
        policy: homePageTracePolicy,
      }),
    ).toThrow(`${homePageTracePolicy.maxBytes + 1} bytes`);
  });

  it("fails closed when the production build omits the root home trace", () => {
    expect(() => assertHomeTraceSeen(false)).toThrow(
      "no public home trace at app/page.js.nft.json",
    );
    expect(() => assertHomeTraceSeen(true)).not.toThrow();
  });
});

describe("newsletter daily-runs GET build trace policy", () => {
  const dailyRunsTracePath =
    "/workspace/.next/server/app/api/newsletter/daily-runs/route.js.nft.json";

  it.each([
    "../../../node_modules/puppeteer-core/lib/cjs/puppeteer.js",
    "../../../node_modules/typescript/lib/typescript.js",
    "../../../data/backups/company.json",
    "../../../scripts/generate-newsletter.ts",
    "../../../.artifacts/private-eval.json",
    "../../../lib/generated-stock-why-moving.js",
    "../../../lib/newsletter/daily-automation.js",
    "../../../lib/newsletter/daily-runs.js",
    "../../../lib/newsletter/drafts.js",
    "../../../lib/newsletter/chart-library.js",
  ])("rejects a heavy command or local path: %s", (forbiddenPath) => {
    expect(() =>
      assertBoundedTrace({
        tracePath: dailyRunsTracePath,
        files: [forbiddenPath],
        tracedBytes: 1,
        policy: dailyRunsGetTracePolicy,
      }),
    ).toThrow(/forbidden path/);
  });

  it("rejects traces over either resource budget", () => {
    expect(() =>
      assertBoundedTrace({
        tracePath: dailyRunsTracePath,
        files: Array.from(
          { length: dailyRunsGetTracePolicy.maxFiles + 1 },
          (_, index) => `../../../node_modules/example-${index}.js`,
        ),
        tracedBytes: 1,
        policy: dailyRunsGetTracePolicy,
      }),
    ).toThrow("151 files");

    expect(() =>
      assertBoundedTrace({
        tracePath: dailyRunsTracePath,
        files: ["../../../node_modules/example/index.js"],
        tracedBytes: dailyRunsGetTracePolicy.maxBytes + 1,
        policy: dailyRunsGetTracePolicy,
      }),
    ).toThrow(`${dailyRunsGetTracePolicy.maxBytes + 1} bytes`);
  });

  it("fails closed when the build omits the exact GET trace", () => {
    expect(() => assertDailyRunsGetTraceSeen(false)).toThrow(
      "no Newsletter Daily Runs GET trace",
    );
    expect(() => assertDailyRunsGetTraceSeen(true)).not.toThrow();
  });
});

describe("Why Moved admin page build trace policy", () => {
  const whyMovedTracePath =
    "/workspace/.next/server/app/admin/why-moved/page.js.nft.json";

  it.each([
    "../../../node_modules/@puppeteer/browsers/lib/cjs/main.js",
    "../../../node_modules/puppeteer-core/lib/cjs/puppeteer.js",
    "../../../node_modules/openai/index.js",
    "../../../node_modules/typescript/lib/typescript.js",
    "../../../node_modules/tsx/dist/cli.mjs",
    "../../../data/aapl-fmp-metrics.json",
    "../../../test-data/golden-test-set.json",
    "../../../scripts/generate-newsletter-local.ts",
    "../../../package-lock.json",
    "../../../app/actions/why-moved-review.js",
    "../../../lib/stock-why-moving.js",
    "../../../lib/newsletter/catalyst-workflow.js",
    "../../../lib/newsletter/capture.js",
    "../../../lib/newsletter/drafts.js",
    "../../../lib/newsletter/generation.js",
    "../../../lib/newsletter/orchestrate.js",
  ])("rejects a command-only or heavy server path: %s", (forbiddenPath) => {
    expect(() =>
      assertBoundedTrace({
        tracePath: whyMovedTracePath,
        files: [forbiddenPath],
        tracedBytes: 1,
        policy: whyMovedAdminPageTracePolicy,
      }),
    ).toThrow(/forbidden path/);
  });

  it("allows the lightweight read model inside both resource budgets", () => {
    expect(() =>
      assertBoundedTrace({
        tracePath: whyMovedTracePath,
        files: [
          "../../../lib/newsletter/draft-summary-read.js",
          "../../../node_modules/@supabase/supabase-js/dist/main/index.js",
        ],
        tracedBytes: 2 * 1024 * 1024,
        policy: whyMovedAdminPageTracePolicy,
      }),
    ).not.toThrow();
  });

  it("rejects traces over either resource budget", () => {
    expect(() =>
      assertBoundedTrace({
        tracePath: whyMovedTracePath,
        files: Array.from(
          { length: whyMovedAdminPageTracePolicy.maxFiles + 1 },
          (_, index) => `../../../node_modules/example-${index}.js`,
        ),
        tracedBytes: 1,
        policy: whyMovedAdminPageTracePolicy,
      }),
    ).toThrow("151 files");

    expect(() =>
      assertBoundedTrace({
        tracePath: whyMovedTracePath,
        files: ["../../../node_modules/example/index.js"],
        tracedBytes: whyMovedAdminPageTracePolicy.maxBytes + 1,
        policy: whyMovedAdminPageTracePolicy,
      }),
    ).toThrow(`${whyMovedAdminPageTracePolicy.maxBytes + 1} bytes`);
  });

  it("fails closed when the exact admin page trace is absent", () => {
    expect(() => assertWhyMovedAdminPageTraceSeen(false)).toThrow(
      "no Why Moved admin page trace at app/admin/why-moved/page.js.nft.json",
    );
    expect(() => assertWhyMovedAdminPageTraceSeen(true)).not.toThrow();
  });
});
