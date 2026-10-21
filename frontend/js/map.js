// Leaflet map helpers. Leaflet is loaded as a global (vendor/leaflet/leaflet.js), so there is no build step.
// Text from the API is never passed to Leaflet as a string: Leaflet renders strings as HTML (see tests/safety.test.mjs).
/* global L */
import { colorFor, fmt } from "./scale.js";
import { apiUrl } from "./api.js";

export const DEFAULT_VIEW = { center: [3.187, 101.511], zoom: 13 }; // City of Elmina
const STREET_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

// Offline basemap drawn from our own cached OpenStreetMap layers, in drawing order.
const BASEMAP_STYLES = {
  open_land: { stroke: false, fillColor: "#e8e3cf", fillOpacity: 0.9 },
  parks: { stroke: false, fillColor: "#cde2c0", fillOpacity: 0.9 },
  buildings: { stroke: false, fillColor: "#d0d3d2", fillOpacity: 0.95 },
  roads: { color: "#bcc2c0", weight: 1, fill: false },
  paths: { color: "#6b8fb5", weight: 1, dashArray: "2 3", fill: false },
};
const SITE_STYLE = { weight: 0.6, color: "#ffffff", fillOpacity: 0.92 };
const TOP_STYLE = { weight: 1.6, color: "#17302b" };      // the top sites stand out even before you zoom in
const SELECTED_STYLE = { weight: 3, color: "#111111" };

/** Create a map with its own drawing layers (panes) so basemap, overlays, sites, corridor and badges stack correctly. */
export function createMap(elementId, { zoomControl = true } = {}) {
  const map = L.map(elementId, { preferCanvas: true, zoomControl, attributionControl: false, ...DEFAULT_VIEW });
  map.setView(DEFAULT_VIEW.center, DEFAULT_VIEW.zoom);
  const panes = { basemap: 250, overlays: 300, corridor: 420, sites: 450, badges: 480 };
  for (const [name, z] of Object.entries(panes)) map.createPane(name).style.zIndex = z;
  L.control.scale({ imperial: false, position: "bottomright" }).addTo(map);
  return map;
}

/** The offline basemap as one layer group (or null if the data set has no OSM layers). */
export function createBasemap(osmLayers) {
  const group = L.layerGroup();
  for (const name of Object.keys(BASEMAP_STYLES)) {
    const data = osmLayers?.[name];
    if (!data) continue;
    L.geoJSON(data, { pane: "basemap", interactive: false, style: () => BASEMAP_STYLES[name] }).addTo(group);
  }
  return group.getLayers().length ? group : null;
}

/** Corridor outline plus the dashed connector lines. Always described as approximate in the UI. */
export function createCorridor(corridor, spine) {
  const group = L.layerGroup();
  if (corridor) {
    L.geoJSON(corridor, {
      pane: "corridor", interactive: false, style: () => ({ color: "#c2410c", weight: 2, fill: false }),
    }).addTo(group);
  }
  if (spine) {
    L.geoJSON(spine, {
      pane: "corridor", interactive: false, style: () => ({ color: "#c2410c", weight: 2, dashArray: "6 4", fill: false }),
    }).addTo(group);
  }
  return group.getLayers().length ? group : null;
}

export function createOverlay(overlay, opacity = 0.72) {
  return L.imageOverlay(apiUrl(overlay.url), overlay.bounds, { pane: "overlays", opacity, interactive: false });
}

export function createStreetTiles() {
  return L.tileLayer(STREET_TILES, { maxZoom: 19, pane: "basemap", attribution: "© OpenStreetMap contributors" });
}

/**
 * The candidate sites as clickable polygons.
 * update(ranked, [min, max], visibleIds, topIds) recolours by score_total, shows only the visible ids and outlines the top ids.
 */
export function createSitesLayer(features, onSelect) {
  const group = L.layerGroup();
  const layers = new Map();
  let selected = null;
  let top = new Set();
  const baseStyle = (id) => (top.has(id) ? { ...SITE_STYLE, ...TOP_STYLE } : SITE_STYLE);
  for (const feature of features) {
    const id = feature.properties.site_id;
    const layer = L.geoJSON(feature, { pane: "sites", style: () => SITE_STYLE });
    layer.on("click", () => onSelect(id));
    layer.bindTooltip("", { sticky: true });
    layers.set(id, layer);
    group.addLayer(layer);
  }
  return {
    group,
    bounds: () => L.featureGroup([...layers.values()]).getBounds(),
    center: (id) => layers.get(id)?.getBounds().getCenter() ?? null,
    update(ranked, [min, max], visible, topIds = new Set()) {
      top = topIds;
      for (const f of ranked) {
        const id = f.properties.site_id;
        const layer = layers.get(id);
        if (!layer) continue;
        layer.setStyle({ ...baseStyle(id), fillColor: colorFor(f.properties.score_total, min, max) });
        // Leaflet treats a string as HTML, and the site id comes from the API, so hand it a text node instead.
        const tip = document.createElement("span");
        tip.textContent = `#${f.properties.rank}  ${id}  score ${fmt(f.properties.score_total, 0)}`;
        layer.setTooltipContent(tip);
        const shown = visible.has(id);
        if (shown && !group.hasLayer(layer)) group.addLayer(layer);
        if (!shown && group.hasLayer(layer)) group.removeLayer(layer);
      }
      if (selected) this.select(selected);
    },
    select(id) {
      if (selected && layers.has(selected)) layers.get(selected).setStyle(baseStyle(selected));
      selected = id;
      const layer = layers.get(id);
      if (layer && group.hasLayer(layer)) {
        layer.setStyle(SELECTED_STYLE);
        layer.bringToFront();
      }
    },
    focus(id, map) {
      const c = this.center(id);
      if (c) map.panTo(c);
    },
  };
}

/**
 * Numbered badges (1 to 5) on the highest-priority sites. Built from DOM nodes, never from API text.
 * Badges that would overlap are nudged apart (rank 1 stays exactly on its site) so every rank stays visible.
 */
export function createBadges(onSelect, map) {
  const group = L.layerGroup();
  const SIZE = 28;                 // minimum distance between badge centres, in pixels
  let placed = [];                 // [{ marker, base }] in rank order

  function layout() {
    const taken = [];
    for (const { marker, base } of placed) {
      const home = map.latLngToLayerPoint(base);
      let at = home;
      for (let step = 1; step <= 12 && taken.some((q) => q.distanceTo(at) < SIZE); step++) {
        const angle = step * (Math.PI / 4);                     // spiral outwards around the true position
        const radius = SIZE * (1 + Math.floor((step - 1) / 8) * 0.8);
        at = home.add(L.point(Math.cos(angle) * radius, Math.sin(angle) * radius));
      }
      taken.push(at);
      marker.setLatLng(map.layerPointToLatLng(at));
    }
  }
  map.on("zoomend", layout);

  return {
    group,
    /** rows: ranked features to badge (already limited); centerOf(id) gives a LatLng; selectedId marks one badge. */
    update(rows, centerOf, selectedId) {
      group.clearLayers();
      placed = [];
      for (const f of rows) {
        const id = f.properties.site_id;
        const at = centerOf(id);
        if (!at) continue;
        const rank = Number(f.properties.rank);
        const badge = document.createElement("span");
        badge.className = id === selectedId ? "rank-badge selected" : "rank-badge";
        badge.textContent = String(rank);
        const marker = L.marker(at, {
          pane: "badges", keyboard: true, title: `Rank ${rank}: show why`, riseOnHover: true,
          icon: L.divIcon({ html: badge, className: "rank-wrap", iconSize: [26, 26], iconAnchor: [13, 13] }),
        });
        marker.on("click", () => onSelect(id));
        group.addLayer(marker);
        placed.push({ marker, base: at });
      }
      layout();
    },
  };
}
