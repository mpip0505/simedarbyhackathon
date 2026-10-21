// A shareable link: the slider weights and the selected site live in the address after the # (for example #w=45,30,25&site=ELM-3734-11725).
// Pure functions, no DOM. Anything that does not parse is ignored, so a mangled link never breaks the page.
const SITE_ID = /^[A-Za-z0-9_-]{1,40}$/;
const KEYS = ["cooling", "connectivity", "shade"];

/** { weights, site } from a hash string; each is null when missing or invalid. Weights are whole numbers 0 to 100 with at least one above zero. */
export function parseHash(hash) {
  const out = { weights: null, site: null };
  const params = new URLSearchParams(String(hash ?? "").replace(/^#/, ""));
  const w = params.get("w");
  if (w) {
    const parts = w.split(",").map((x) => (/^\d{1,3}$/.test(x) ? Number(x) : NaN));
    if (parts.length === 3 && parts.every((n) => n >= 0 && n <= 100) && parts.some((n) => n > 0)) out.weights = Object.fromEntries(KEYS.map((k, i) => [k, parts[i]]));
  }
  const site = params.get("site");
  if (site && SITE_ID.test(site)) out.site = site;
  return out;
}

/** The hash for the current state: weights only when they differ from the defaults, then the site. Empty string when there is nothing to keep. */
export function buildHash({ weights, defaults, site }) {
  const parts = [];
  if (weights && defaults && KEYS.some((k) => Math.round(weights[k]) !== Math.round(defaults[k]))) parts.push(`w=${KEYS.map((k) => Math.round(weights[k])).join(",")}`);
  if (site && SITE_ID.test(site)) parts.push(`site=${site}`);
  return parts.length ? `#${parts.join("&")}` : "";
}
