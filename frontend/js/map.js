// Leaflet map helpers. Leaflet is loaded as a global (vendor/leaflet/leaflet.js), so there is no build step.
// Text from the API is never passed to Leaflet as a string: Leaflet renders strings as HTML (see tests/safety.test.mjs).
/* global L */
import { colorFor, fmt } from "./scale.js";
import { apiUrl } from "./api.js";
import { BADGE_HEIGHT, badgeSpacing, badgeWidth } from "./badge.js";

export const DEFAULT_VIEW = { center: [3.187, 101.511], zoom: 13 }; // City of Elmina
const STREET_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

// Offline basemap drawn from our own cached OpenStreetMap layers, in drawing order.
const BASEMAP_STYLES = {
  open_land: { stroke: false, fillColor: "#E9E8DE", fillOpacity: 0.9 },
  parks: { stroke: false, fillColor: "#DCE9D2", fillOpacity: 0.9 },
  buildings: { stroke: false, fillColor: "#D9D9D3", fillOpacity: 0.95 },
  roads: { color: "#D6D6CF", weight: 1.3, fill: false },
  paths: { color: "#A9A9A1", weight: 0.8, dashArray: "2 2", fill: false },
};
const CORRIDOR = "#2F7D32";                                // the green corridor: approximate, so dashed
const SITE_STYLE = { weight: 0.5, color: "#181816", opacity: 0.3, fillOpacity: 0.92 };
const TOP_STYLE = { weight: 1.6, color: "#181816", opacity: 1 };   // the top sites stand out even before you zoom in
const SELECTED_STYLE = { weight: 3, color: "#D13C06", opacity: 1 };  // Ember, the accent

/** Create a map with its own drawing layers (panes) so basemap, overlays, sites, corridor and badges stack correctly. */
export function createMap(elementId, { zoomControl = true, canvas = true } = {}) {
  const map = L.map(elementId, { preferCanvas: canvas, zoomControl: false, attributionControl: false, ...DEFAULT_VIEW });
  map.setView(DEFAULT_VIEW.center, DEFAULT_VIEW.zoom);
  if (zoomControl) L.control.zoom({ position: "topright" }).addTo(map);
  const panes = { basemap: 250, overlays: 300, paths: 410, corridor: 420, sites: 450, badges: 480 };
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

// Footpath pieces by relative greenness. Colour is never the only signal: the least green pieces are thick and solid, the greenest thin and dotted.
const PATH_STYLES = {
  least_green: { color: "#b13a06", weight: 4, opacity: 0.95 },
  middle: { color: "#c9972c", weight: 3, opacity: 0.9, dashArray: "8 4" },
  greenest: { color: "#2f7d32", weight: 2, opacity: 0.9, dashArray: "1 5" },
};

/** Footpaths coloured by how green they are along their length (relative thirds). A satellite proxy, not a shade survey. */
export function createPathShade(data) {
  if (!data?.features?.length) return null;
  return L.geoJSON(data, { pane: "paths", interactive: false, style: (f) => PATH_STYLES[f.properties?.third] ?? PATH_STYLES.middle });
}

/** Corridor outline plus the dashed connector lines. Always described as approximate in the UI. */
export function createCorridor(corridor, spine) {
  const group = L.layerGroup();
  if (corridor) {
    L.geoJSON(corridor, {
      pane: "corridor", interactive: false,
      style: () => ({ color: CORRIDOR, weight: 1.2, dashArray: "5 4", fill: true, fillColor: CORRIDOR, fillOpacity: 0.09 }),
    }).addTo(group);
  }
  if (spine) {
    L.geoJSON(spine, {
      pane: "corridor", interactive: false, style: () => ({ color: CORRIDOR, weight: 2, dashArray: "7 5", fill: false }),
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
    /**
     * Bring a site into view. `free` is the part of the map that no panel covers, { x, y, w, h } in map pixels (default: all of it).
     * By default the site is centred in that area; with center: false the map only moves as far as needed to keep the site inside it.
     */
    focus(id, map, { free = null, center = true } = {}) {
      const c = this.center(id);
      if (!c) return;
      const size = map.getSize();
      const area = free ?? { x: 0, y: 0, w: size.x, h: size.y };
      if (area.w < 80 || area.h < 80) return;                   // too little room to be worth moving the map for
      const at = map.latLngToContainerPoint(c);
      if (center) {
        map.panBy(at.subtract(L.point(area.x + area.w / 2, area.y + area.h / 2)));
        return;
      }
      const margin = 24;
      const move = (v, lo, hi) => (v < lo + margin ? v - (lo + margin) : v > hi - margin ? v - (hi - margin) : 0);
      const dx = move(at.x, area.x, area.x + area.w), dy = move(at.y, area.y, area.y + area.h);
      if (dx || dy) map.panBy([dx, dy]);
    },
  };
}

/**
 * Numbered badges (up to 5) on the highest-priority sites. Built from DOM nodes, never from API text.
 * A badge is a circle for ranks up to 99 and a wider pill from 100 (js/badge.js), so the number always fits.
 * Badges that would overlap are nudged apart (the first stays exactly on its site) so every rank stays visible.
 */
export function createBadges(onSelect, map) {
  const group = L.layerGroup();
  let placed = [];                 // [{ marker, base, w }] in rank order, w is the badge width in pixels

  function layout() {
    const taken = [];              // [{ point, w }] centres already used
    for (const { marker, base, w } of placed) {
      const home = map.latLngToLayerPoint(base);
      let at = home;
      for (let step = 1; step <= 12 && taken.some((q) => Math.abs(q.point.x - at.x) < badgeSpacing(q.w, w) && Math.abs(q.point.y - at.y) < BADGE_HEIGHT + 2); step++) {
        const angle = step * (Math.PI / 4);                     // spiral outwards around the true position
        const radius = badgeSpacing(w, w) * (1 + Math.floor((step - 1) / 8) * 0.8);
        at = home.add(L.point(Math.cos(angle) * radius, Math.sin(angle) * radius));
      }
      taken.push({ point: at, w });
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
        const w = badgeWidth(rank);
        const badge = document.createElement("span");
        badge.className = id === selectedId ? "rank-badge selected" : "rank-badge";
        if (w > BADGE_HEIGHT) badge.classList.add("wide");        // three digits or more: a smaller number in a pill
        badge.textContent = String(rank);
        const marker = L.marker(at, {
          pane: "badges", keyboard: true, title: `Rank ${rank}: show why`, riseOnHover: true,
          icon: L.divIcon({ html: badge, className: "rank-wrap", iconSize: [w, BADGE_HEIGHT], iconAnchor: [w / 2, BADGE_HEIGHT / 2] }),
        });
        marker.on("click", () => onSelect(id));
        group.addLayer(marker);
        placed.push({ marker, base: at, w });
      }
      layout();
    },
  };
}
