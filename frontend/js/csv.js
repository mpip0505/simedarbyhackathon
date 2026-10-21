// CSV export of the ranked list (the "planting order"). Pure functions, no DOM.

export const COLUMNS = [
  { key: "rank", label: "rank" },
  { key: "site_id", label: "site_id" },
  { key: "score_total", label: "score_total" },
  { key: "score_cooling", label: "score_cooling" },
  { key: "score_connectivity", label: "score_connectivity" },
  { key: "score_shade", label: "score_shade" },
  { key: "origin", label: "origin" },
  { key: "lon", label: "lon" },
  { key: "lat", label: "lat" },
  { key: "source", label: "source" },
  { key: "score_source", label: "score_source" },
];

/** Mean of a Polygon's outer-ring vertices (fine for 30 m cells); null for other geometry. */
export function centroid(geometry) {
  if (!geometry || geometry.type !== "Polygon") return null;
  const ring = geometry.coordinates[0].slice(0, -1);
  const n = ring.length;
  return { lon: ring.reduce((a, c) => a + c[0], 0) / n, lat: ring.reduce((a, c) => a + c[1], 0) / n };
}

/** Flat rows for the CSV, in the order given. `source` and `score_source` keep the "simulated" and "placeholder" labels. */
export function rankedRows(features) {
  return features.map((f) => {
    const c = centroid(f.geometry);
    return { ...f.properties, lon: c ? Number(c.lon.toFixed(6)) : null, lat: c ? Number(c.lat.toFixed(6)) : null };
  });
}

function cell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows, columns = COLUMNS) {
  const lines = [columns.map((c) => cell(c.label)).join(",")];
  for (const row of rows) lines.push(columns.map((c) => cell(row[c.key])).join(","));
  return lines.join("\r\n") + "\r\n";
}
