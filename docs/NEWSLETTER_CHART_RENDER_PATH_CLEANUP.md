# Newsletter Chart Render Path Cleanup

## What we're building

A unified, single-path system for rendering charts in our email newsletters. Today we have two parallel render paths doing nearly the same job — we're getting rid of one.

## Why we're building it

The newsletter shows charts as PNG images. The PNGs aren't drawn by fin-quote; they're drawn by a separate service (the charting platform repo, running on its own server). Fin-quote sends a description of the chart, the platform draws it, screenshots it, sends it back. Fin-quote embeds the PNG in the email.

The problem: the charting platform exposes **two different endpoints** for newsletter charts, and fin-quote uses both. Same product, two render paths, two sets of layout rules. They drift apart over time, and bug fixes have to be applied to both.

This came to a head when the y-axis current-price badge started getting clipped on the right edge of newsletter chart images. The platform team fixed it on one endpoint. Fresh newsletter charts still clipped. Charts that had been opened in the editor and saved looked fine. That's what surfaced the duplicated render path and motivated this cleanup.

## How the two paths exist (the "two doors")

The charting platform has two URLs fin-quote can POST a chart spec to. Both lead to the same chart drawing engine, but each takes a different shape of input and has its own setup code.

**The old door — `/tos/api/newsletter/render`.** Built first. Accepts a small description: ticker, range, interval, chart type, plus a small `priceState` snapshot. The platform fills in everything else with defaults.

**The new door — `/api/chart-export/render`.** Built later to support the export editor (the page where users tweak every knob on a chart — indicators, viewport, theme, title, background, etc.). Accepts a much richer spec containing all of those settings.

### Which door fin-quote uses, and when

Fin-quote picks the door in `lib/newsletter/capture.ts`:

```ts
if (isPriceNewsletterChartSpec(spec) && spec.chartExportSpec) {
  return captureChartFromExportSpec(spec, options)   // new door
}
// otherwise falls through to the old door
```

The decision hinges entirely on whether the block carries a `chartExportSpec`.

- **When a newsletter is first auto-generated**, blocks are created from minimal data (ticker + range + interval). No `chartExportSpec` is built. Fin-quote uses the **old door**.
- **When a user opens the chart in the export editor and clicks Save**, the platform builds a full `chartExportSpec` and posts it back. Fin-quote stores it on the block. From then on, that block uses the **new door**.

So in practice, the old door serves every fresh newsletter chart, and the new door serves any chart a human has touched.

## The conversation that surfaced this

The trail went roughly:

1. **Observation**: the current-price label (the black badge on the right axis) was clipped on the right edge of newsletter chart images. The cleaner y-axis tick labels were getting tight against the edge too.
2. **Initial guess**: a fin-quote layout issue — maybe our card padding or chart dimensions were off.
3. **Ruled out fin-quote layout**: we just shipped a card-width fix (660px card with 20px gutters around the 620×440 chart). That changed the card border, not the chart pixels. The chart PNG was already clipped before the gutter change.
4. **Reproduced in the editor**: in the platform's `/export-editor`, the live preview at 620×440 rendered the badge cleanly. The newsletter PNG of the same chart did not. Same engine, same dimensions, different output.
5. **Identified the headless-capture difference**: the chart engine puts axis labels in a gutter just outside the export viewport. The editor preview pane is wider than 620, so the labels show. The headless PNG capture grabs only the 620×440 box, so the labels get cropped.
6. **Platform team shipped a fix**: bumped `axisWidth: 50 → 64` for `renderProfile: 'newsletter'` on `/api/chart-export/render`. New door fixed.
7. **Bug persisted on fresh charts**: confirming that fresh charts go through the **old door**, which the fix didn't touch.
8. **Confirmed by user action**: opening a chart in the editor and clicking Save (which attaches a `chartExportSpec`) made the next regenerate use the new door. Badge rendered cleanly. Diagnosis confirmed.

## The plan

Two stages: a quick patch to stop the bleeding, then the architectural cleanup.

### Stage 1 — patch the old door (charting platform repo, immediate)

Apply the same `axisWidth: 50 → 64` fix the platform team made on `/api/chart-export/render` to the legacy `/tos/api/newsletter/render` route.

- Tiny mirror of an already-shipped fix. Low risk.
- Unblocks every fresh newsletter chart today.
- Lives entirely in the platform repo.

This is a short-term workaround. It doesn't solve the duplication, but it stops the visible bug for users right now.

### Stage 2 — eliminate the old door from fin-quote (this repo, follow-up)

Change fin-quote so it never uses the old door. Every chart goes through the new door from the moment it's created.

Concretely:

1. **At newsletter generation time**, build a full `chartExportSpec` for every price block — not just when the user opens the editor. The function that builds it already exists: `buildPriceExportEditorBaseSpec` in `lib/newsletter/chart-editor.ts`. We just call it earlier, in the orchestrator path where blocks are first assembled.
2. **Attach the resulting spec** to the block's `chartSpec.chartExportSpec` field before the first render.
3. **Verify**: with this in place, `lib/newsletter/capture.ts` will always take the `captureChartFromExportSpec` branch. The old-door codepath becomes dead.
4. **Remove the old-door fallback** from `captureChart` once we've confirmed nothing else hits it.
5. **Deprecate `/tos/api/newsletter/render`** in the platform repo once it has no remaining callers.

### Why we're not jumping straight to Stage 2

- Stage 2 is the right long-term fix, but it touches the orchestrator, the draft document shape, and the capture flow. It needs verification across all chart types and templates.
- Stage 1 is a five-character constant change in one file in a different repo. It ships in minutes and immediately makes the user-visible bug go away.
- Doing them in this order keeps users unblocked while we do Stage 2 carefully.

## Success criteria

- **Stage 1 done**: every freshly generated newsletter renders the current-price badge and y-axis tick labels fully inside the 620×440 image. No need for users to open + save in the editor to get a correct chart.
- **Stage 2 done**: only one render path runs in production. The legacy endpoint has zero callers from fin-quote, and the chart you see in the editor preview is pixel-equivalent to the chart in the email.

## Open questions for Stage 2

- Are there callers of `/tos/api/newsletter/render` outside fin-quote? If yes, the endpoint can't be removed on the platform side until those callers migrate.
- Do all newsletter chart templates (price, fundamentals, etc.) round-trip through the new-door rendering, or only price charts? Fundamentals charts may need their own treatment — they currently use a different editor surface (`resolveNewsletterChartEditor`, not the export editor).
- What's the right defaulting strategy for fields like `viewportTimeRange` at generation time? `buildPriceExportEditorBaseSpec` already computes these; we should confirm its defaults match what the legacy renderer produces today so users don't see visible changes when the cutover happens.
