import { sign as cryptoSign } from "crypto";
import { gunzipSync } from "zlib";

// App Store Connect API auth: a short-lived ES256 JWT signed with the .p8
// team key from App Store Connect > Users and Access > Integrations > Keys.
// Built by hand with Node's crypto (ieee-p1363 signature encoding = raw
// R||S, which is what JWS ES256 wants) instead of pulling in `jsonwebtoken`
// for one call site.
function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildJwt(): string {
  const issuerId = process.env.APP_STORE_CONNECT_ISSUER_ID;
  const keyId = process.env.APP_STORE_CONNECT_KEY_ID;
  const privateKey = process.env.APP_STORE_CONNECT_PRIVATE_KEY;
  if (!issuerId || !keyId || !privateKey) {
    throw new Error("App Store Connect credentials not configured");
  }

  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  // Apple caps these tokens at 20 minutes; stay comfortably under that.
  const payload = { iss: issuerId, iat: now, exp: now + 19 * 60, aud: "appstoreconnect-v1" };

  // Env vars carry the .p8 PEM as either real newlines (Vercel's UI textarea
  // preserves them as-is) or literal "\n" escapes inside a quoted single
  // line (how a multiline value has to be stored in .env.local) — normalize
  // to real newlines either way, since Node's PEM decoder wants the latter.
  const pem = privateKey.replace(/\\n/g, "\n");

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = cryptoSign("sha256", Buffer.from(signingInput), {
    key: pem,
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${base64url(signature)}`;
}

export interface DailySalesSummary {
  reportDate: string;
  units: number;
  proceeds: number;
  proceedsCurrency: string;
}

// Pulls the DAILY/SUMMARY/SALES report for one calendar date. Apple
// publishes these ~24-48h after the fact, so a recent date will 404 until
// it's ready — that's a normal, expected outcome here, not an error.
export async function fetchDailySalesSummary(reportDate: string): Promise<DailySalesSummary | null> {
  const vendorNumber = process.env.APP_STORE_CONNECT_VENDOR_NUMBER;
  if (!vendorNumber) throw new Error("APP_STORE_CONNECT_VENDOR_NUMBER not configured");

  const token = buildJwt();
  // No `version` param here — Apple's API rejects it (400
  // PARAMETER_ERROR.ILLEGAL) for this reportType/reportSubType combination;
  // it's only required for a handful of other report types (e.g. SUBSCRIPTION).
  const params = new URLSearchParams({
    "filter[frequency]": "DAILY",
    "filter[reportDate]": reportDate,
    "filter[reportSubType]": "SUMMARY",
    "filter[reportType]": "SALES",
    "filter[vendorNumber]": vendorNumber,
  });

  const res = await fetch(`https://api.appstoreconnect.apple.com/v1/salesReports?${params}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/a-gzip" },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`App Store Connect sales report fetch failed: ${res.status} ${await res.text()}`);
  }

  const gz = Buffer.from(await res.arrayBuffer());
  const tsv = gunzipSync(gz).toString("utf8");
  const lines = tsv.split("\n").filter((l) => l.length > 0);
  if (lines.length < 2) return { reportDate, units: 0, proceeds: 0, proceedsCurrency: "USD" };

  const cols = lines[0].split("\t");
  const unitsIdx = cols.indexOf("Units");
  const proceedsIdx = cols.indexOf("Developer Proceeds");
  const currencyIdx = cols.indexOf("Currency of Proceeds");

  let units = 0;
  // "Developer Proceeds" is a PER-UNIT figure, not a row total — Apple's own
  // report quirk. Row total is Units * Developer Proceeds. Only USD rows are
  // summed into `proceeds`; other storefronts sell in their local currency
  // and naively adding e.g. EUR + JPY figures together would produce a
  // number that looks precise but means nothing. Units (a plain count) has
  // no such problem and is accurate across every storefront.
  let proceedsUsd = 0;
  for (const line of lines.slice(1)) {
    const row = line.split("\t");
    const u = parseInt(row[unitsIdx], 10);
    if (Number.isNaN(u)) continue;
    units += u;
    if (row[currencyIdx] === "USD") {
      const perUnit = parseFloat(row[proceedsIdx]);
      if (!Number.isNaN(perUnit)) proceedsUsd += perUnit * u;
    }
  }

  return {
    reportDate,
    units,
    proceeds: Math.round(proceedsUsd * 100) / 100,
    proceedsCurrency: "USD",
  };
}

// ── Analytics Reports API ───────────────────────────────────────────────────
//
// Impressions, product page views, and download-type/device splits come from
// the Analytics Reports API — a separate pipeline from the sales reports
// above. A one-time ONGOING "report request" is registered per app; Apple
// then generates daily report instances (lagging ~24-48h like sales) whose
// data is downloaded as gzipped CSV segments.

const ASC_API = "https://api.appstoreconnect.apple.com/v1";

// ParkQuest's numeric App Store id — public (it's in the store URL), so a
// hardcoded default with an env override is fine here.
const DEFAULT_APP_ID = "6778208311";

function appleAppId(): string {
  return process.env.APP_STORE_CONNECT_APP_ID ?? DEFAULT_APP_ID;
}

interface AscResource {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
}

async function ascGet(pathAndQuery: string, token: string): Promise<{ data: AscResource[] }> {
  const res = await fetch(`${ASC_API}${pathAndQuery}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`App Store Connect GET ${pathAndQuery} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

// Finds the app's ONGOING analytics report request, creating it if it has
// never been registered. Creation is a one-time act: Apple starts generating
// daily reports ~24-48h afterwards, so `justCreated: true` means "no data
// will exist yet — try again tomorrow".
export async function ensureAnalyticsReportRequest(): Promise<{ requestId: string; justCreated: boolean }> {
  const token = buildJwt();
  const list = await ascGet(`/apps/${appleAppId()}/analyticsReportRequests?filter[accessType]=ONGOING`, token);
  const active = list.data.find((r) => !r.attributes?.stoppedDueToInactivity);
  if (active) return { requestId: active.id, justCreated: false };

  const res = await fetch(`${ASC_API}/analyticsReportRequests`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      data: {
        type: "analyticsReportRequests",
        attributes: { accessType: "ONGOING" },
        relationships: { app: { data: { type: "apps", id: appleAppId() } } },
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`App Store Connect analytics report request creation failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { data: AscResource };
  return { requestId: json.data.id, justCreated: true };
}

export interface EngagementDailyMetrics {
  impressions: number;
  impressionsUnique: number;
  productPageViews: number;
}

export interface DownloadsDailyMetrics {
  firstTimeDownloads: number;
  redownloads: number;
  // Device dimension (iPhone, iPad, Desktop, …) → download-type split.
  byDevice: Map<string, { firstTimeDownloads: number; redownloads: number }>;
}

// Segment files are documented as CSV but delimiters have varied across
// Apple report families (sales is TSV) — sniff the header line instead of
// assuming.
function parseDelimited(text: string): Record<string, string>[] {
  const lines = text.split("\n").map((l) => l.replace(/\r$/, "")).filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const delim = lines[0].includes("\t") ? "\t" : ",";
  const split = (line: string): string[] => {
    if (delim === "\t") return line.split("\t");
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
        } else cur += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === ",") { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const headers = split(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = split(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ""; });
    return row;
  });
}

// The reports list uses fuzzy matching rather than filter[name] because
// Apple has shipped both plain ("App Downloads") and suffixed ("App
// Downloads Standard") names for the same report family.
function pickReportId(reports: AscResource[], needle: string, exclude?: string): string | null {
  const matches = reports.filter((r) => {
    const name = String(r.attributes?.name ?? "").toLowerCase();
    return name.includes(needle) && (!exclude || !name.includes(exclude));
  });
  const standard = matches.find((r) => String(r.attributes?.name ?? "").toLowerCase().includes("standard"));
  return (standard ?? matches[0])?.id ?? null;
}

async function downloadInstanceRows(instanceId: string, token: string): Promise<Record<string, string>[]> {
  const segments = await ascGet(`/analyticsReportInstances/${instanceId}/segments`, token);
  const rows: Record<string, string>[] = [];
  for (const seg of segments.data) {
    const url = String(seg.attributes?.url ?? "");
    if (!url) continue;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Analytics segment download failed: ${res.status}`);
    let buf = Buffer.from(await res.arrayBuffer());
    // Pre-signed storage URLs serve .gz blobs, but if a hop advertises
    // Content-Encoding the runtime may have already decompressed — check the
    // gzip magic bytes rather than assuming.
    if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf);
    rows.push(...parseDelimited(buf.toString("utf8")));
  }
  return rows;
}

// Collects rows from every DAILY instance processed on the given dates. Rows
// are later bucketed by their own "Date" column — processingDate only
// selects which instances are worth (re)downloading.
async function collectDailyRows(
  reportId: string,
  processingDates: string[],
  token: string,
): Promise<Record<string, string>[]> {
  const rows: Record<string, string>[] = [];
  for (const date of processingDates) {
    const instances = await ascGet(
      `/analyticsReports/${reportId}/instances?filter[granularity]=DAILY&filter[processingDate]=${date}`,
      token,
    );
    for (const inst of instances.data) {
      rows.push(...(await downloadInstanceRows(inst.id, token)));
    }
  }
  return rows;
}

function toCount(value: string | undefined): number {
  const n = parseInt(value ?? "", 10);
  return Number.isNaN(n) ? 0 : n;
}

// Fetches the daily engagement (impressions/page views) and downloads
// (first-time/redownload, per device) metrics for instances processed on the
// given dates. Either map can be missing dates the other has — Apple
// publishes the two report families independently.
export async function fetchAnalyticsDailyMetrics(
  requestId: string,
  processingDates: string[],
): Promise<{ engagement: Map<string, EngagementDailyMetrics>; downloads: Map<string, DownloadsDailyMetrics> }> {
  const token = buildJwt();
  const reports = await ascGet(`/analyticsReportRequests/${requestId}/reports?limit=200`, token);
  // "App Store Web Discovery and Engagement" also matches the needle — the
  // web-store variant is a different dataset, exclude it.
  const engagementReportId = pickReportId(reports.data, "discovery and engagement", "web");
  const downloadsReportId = pickReportId(reports.data, "app downloads");

  const engagement = new Map<string, EngagementDailyMetrics>();
  if (engagementReportId) {
    for (const row of await collectDailyRows(engagementReportId, processingDates, token)) {
      const date = row["Date"];
      if (!date) continue;
      const m = engagement.get(date) ?? { impressions: 0, impressionsUnique: 0, productPageViews: 0 };
      const event = (row["Event"] ?? "").toLowerCase();
      // Unique Counts are unique per row slice (territory/device/source), so
      // summing them overcounts true uniques slightly — same approximation
      // App Store Connect itself makes when a dashboard slices by dimension.
      if (event === "impression") {
        m.impressions += toCount(row["Counts"]);
        m.impressionsUnique += toCount(row["Unique Counts"]);
      } else if (event === "product page view") {
        m.productPageViews += toCount(row["Counts"]);
      }
      engagement.set(date, m);
    }
  }

  const downloads = new Map<string, DownloadsDailyMetrics>();
  if (downloadsReportId) {
    for (const row of await collectDailyRows(downloadsReportId, processingDates, token)) {
      const date = row["Date"];
      if (!date) continue;
      const type = (row["Download Type"] ?? "").toLowerCase();
      const isFirst = type === "first-time download";
      const isRedownload = type === "redownload";
      if (!isFirst && !isRedownload) continue;
      const m = downloads.get(date) ?? { firstTimeDownloads: 0, redownloads: 0, byDevice: new Map() };
      const count = toCount(row["Counts"]);
      const device = row["Device"] || "Unknown";
      const d = m.byDevice.get(device) ?? { firstTimeDownloads: 0, redownloads: 0 };
      if (isFirst) {
        m.firstTimeDownloads += count;
        d.firstTimeDownloads += count;
      } else {
        m.redownloads += count;
        d.redownloads += count;
      }
      m.byDevice.set(device, d);
      downloads.set(date, m);
    }
  }

  return { engagement, downloads };
}
