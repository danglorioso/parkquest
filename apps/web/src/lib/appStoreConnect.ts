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
