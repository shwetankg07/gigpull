import { chromium } from "playwright";

export interface WebProbeResult {
  ok: boolean;
  defects: string[];
  consoleErrors: string[];
  hasViewportMeta: boolean;
  https: boolean;
  transferBytes: number;
  copyrightYear: number | null;
  error?: string;
}

const STALE_COPYRIGHT_YEARS = 2;

function emptyResult(url: string): WebProbeResult {
  return {
    ok: false, defects: [], consoleErrors: [], hasViewportMeta: false,
    https: url.startsWith("https://"), transferBytes: 0, copyrightYear: null,
  };
}

export async function probeWebsite(
  url: string,
  opts: { timeoutMs?: number } = {},
): Promise<WebProbeResult> {
  const timeout = opts.timeoutMs ?? 20_000;
  const result = emptyResult(url);
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.on("console", (msg) => {
      if (msg.type() === "error") result.consoleErrors.push(msg.text());
    });
    page.on("response", (res) => {
      const len = Number(res.headers()["content-length"] ?? 0);
      if (Number.isFinite(len)) result.transferBytes += len;
    });

    await page.goto(url, { waitUntil: "load", timeout });
    result.ok = true;

    result.hasViewportMeta =
      (await page.locator('meta[name="viewport"]').count()) > 0;

    const bodyText = await page.locator("body").innerText();
    const match = bodyText.match(/(?:©|&copy;|copyright)\s*(\d{4})/i);
    result.copyrightYear = match?.[1] ? Number(match[1]) : null;

    // The fixture server serves plain HTTP on loopback; without this exclusion
    // every fixture page would report a no_https defect that has nothing to do
    // with the site under test.
    const isLoopback = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url);

    if (result.consoleErrors.length > 0) result.defects.push("console_errors");
    if (!result.hasViewportMeta) result.defects.push("no_mobile_viewport");
    if (!result.https && !isLoopback) result.defects.push("no_https");
    if (
      result.copyrightYear !== null &&
      new Date().getFullYear() - result.copyrightYear >= STALE_COPYRIGHT_YEARS
    ) {
      result.defects.push("stale_copyright");
    }
  } catch (e) {
    result.ok = false;
    result.defects = [];
    result.error = e instanceof Error ? e.message : String(e);
  } finally {
    await browser.close();
  }

  return result;
}
