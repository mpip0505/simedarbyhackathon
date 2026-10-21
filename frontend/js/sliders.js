// The three weight sliders. Values are 0 to 100; the app normalises them, so only their proportions matter.
import { KEYS, sharePercent } from "./weights.js";
import { $ } from "./dom.js";

/** Wire the sliders to `onChange(weights)`. Returns { set(weights), get() } for resetting from outside. */
export function setupSliders(root, initial, onChange) {
  const inputs = Object.fromEntries(KEYS.map((k) => [k, $(`#w-${k}`, root)]));
  const outputs = Object.fromEntries(KEYS.map((k) => [k, $(`#o-${k}`, root)]));
  const get = () => Object.fromEntries(KEYS.map((k) => [k, Number(inputs[k].value)]));

  function showShares() {
    const w = get();
    if (KEYS.every((k) => w[k] === 0)) {
      for (const k of KEYS) outputs[k].textContent = "0%";
      return;
    }
    const share = sharePercent(w);
    for (const k of KEYS) outputs[k].textContent = `${share[k]}%`;
  }

  const set = (weights) => {
    for (const k of KEYS) inputs[k].value = String(Math.round(weights[k]));
    showShares();
  };
  for (const k of KEYS) {
    inputs[k].addEventListener("input", () => { showShares(); onChange(get()); });
  }
  set(initial);
  return { set, get };
}
