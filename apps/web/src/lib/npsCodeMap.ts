/**
 * Some parks are stored as separate DB entries but share a single NPS API code.
 * Sequoia (sequ) and Kings Canyon (king) are administered together as "seki".
 */
const NPS_CODE_OVERRIDES: Record<string, string> = {
  sequ: "seki",
  king: "seki",
};

export function toNpsCode(parkCode: string): string {
  return NPS_CODE_OVERRIDES[parkCode] ?? parkCode;
}

/** All local park codes that map to a given NPS code */
export function localCodesForNpsCode(npsCode: string): string[] {
  const overrides = Object.entries(NPS_CODE_OVERRIDES).filter(([, v]) => v === npsCode).map(([k]) => k);
  return overrides.length > 0 ? overrides : [npsCode];
}
