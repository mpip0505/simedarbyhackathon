// Talks to the Elmina Canopy Prioritiser API. By default it uses the same origin the page came from.
// To point a separately hosted interface at the API, open the page with ?api=http://localhost:8000
// (the API allows cross-origin GET requests). For safety only a localhost address (any port) or the page's own
// origin is accepted: otherwise a crafted link could make the page load data from someone else's server.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Decide which API address to use. Returns { base, ignored }: ignored is true when ?api= was present but refused. */
export function resolveApiBase(search, pageOrigin = "") {
  const raw = new URLSearchParams(search).get("api");
  if (!raw) return { base: "", ignored: false };
  let url;
  try { url = new URL(raw); } catch { return { base: "", ignored: true }; }
  const plainWeb = url.protocol === "http:" || url.protocol === "https:";
  const noCredentials = !url.username && !url.password;
  const trusted = LOCAL_HOSTS.has(url.hostname) || (pageOrigin !== "" && url.origin === pageOrigin);
  return plainWeb && noCredentials && trusted ? { base: url.origin, ignored: false } : { base: "", ignored: true };
}

const resolved = typeof location !== "undefined" ? resolveApiBase(location.search, location.origin) : { base: "", ignored: false };
const BASE = resolved.base;
export const ignoredApiParam = resolved.ignored;

export class ApiError extends Error {
  constructor(status, message, path) {
    super(message);
    this.name = "ApiError";
    this.status = status; // 0 means the API could not be reached at all
    this.path = path;
  }
}

export const apiUrl = (path) => BASE + path;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function once(path, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(apiUrl(path), { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) {
      let detail = response.statusText;
      try { detail = (await response.json()).detail || detail; } catch { /* body was not JSON */ }
      throw new ApiError(response.status, detail, path);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, error.name === "AbortError" ? "the request timed out" : "the API cannot be reached", path);
  } finally {
    clearTimeout(timer);
  }
}

/** GET JSON with a timeout and one retry for network errors and 502/503/504. Other errors are not retried. */
export async function getJSON(path, { timeoutMs = 15000, retries = 1 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await once(path, timeoutMs);
    } catch (error) {
      const transient = error.status === 0 || [502, 503, 504].includes(error.status);
      if (!transient || attempt >= retries) throw error;
      await sleep(600 * (attempt + 1));
    }
  }
}

/** Like getJSON, but a 404 (a layer this data set does not have) gives null instead of an error. */
export async function getOptional(path, options) {
  try {
    return await getJSON(path, options);
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

export const api = {
  meta: () => getJSON("/meta"),
  weights: () => getJSON("/weights"),
  sites: () => getJSON("/sites"),
  summary: () => getJSON("/summary"),
  corridor: () => getOptional("/layers/corridor"),
  spine: () => getOptional("/layers/corridor/spine"),
  pathShade: () => getOptional("/layers/paths/shade"),
  osm: (name) => getOptional(`/layers/osm/${name}`),
  overlays: () => getOptional("/layers/overlays"),
  series: () => getOptional("/summary/series"),
  crosscheck: () => getOptional("/summary/crosscheck"),
  uncertainty: () => getOptional("/ml/uncertainty"),
  shortlist: () => getOptional("/ml/shortlist"),
  scenario: () => getOptional("/ml/scenario"),
  impact: () => getOptional("/ml/impact"),
  tradeoff: () => getOptional("/ml/tradeoff"),
  reachSets: () => getOptional("/ml/reach-sets"),
};
