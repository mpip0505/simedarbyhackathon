// A small map for one site on the Pilot plan's site page, so you can see which place it is. The offline basemap, the approximate
// corridor, the other sites in the plan (quiet outlines) and this site (Ember outline). Not interactive beyond pan and zoom buttons.
/* global L */
import { createMap, createBasemap, createCorridor } from "./map.js";

/**
 * Draw the map into `container` (it must be on the page and have a height). Returns { remove() }, or null if the map cannot be drawn.
 * parts: { osm, corridor, spine } the same data the main map uses; others: features of the other sites in the plan.
 */
export function createSiteMap(container, feature, others, parts = {}) {
  if (typeof L === "undefined" || !container.offsetWidth || !feature) return null;
  const map = createMap(container, { zoomControl: true, canvas: false });      // vector layers: a canvas map that is removed mid-draw throws in Leaflet
  map.scrollWheelZoom.disable();                         // the page scrolls; the wheel should not zoom by accident
  createBasemap(parts.osm)?.addTo(map);
  if (parts.corridor) createCorridor(parts.corridor, parts.spine)?.addTo(map);
  for (const f of others) {
    if (f === feature) continue;
    L.geoJSON(f, { pane: "sites", interactive: false, style: () => ({ weight: 1, color: "#78786F", opacity: 0.8, fillColor: "#D3D3CE", fillOpacity: 0.7 }) }).addTo(map);
  }
  const here = L.geoJSON(feature, { pane: "sites", interactive: false, style: () => ({ weight: 3, color: "#D13C06", opacity: 1, fillColor: "#FF4D00", fillOpacity: 0.55 }) }).addTo(map);
  const fit = () => { map.invalidateSize(false); map.fitBounds(here.getBounds().pad(1.5), { maxZoom: 18, animate: false }); };
  fit();
  const later = setTimeout(fit, 120);                      // once the page has finished laying out
  return { remove: () => { clearTimeout(later); map.remove(); } };
}
