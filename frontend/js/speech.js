// "Read aloud" for the site card, using the browser's own speech synthesis (nothing is sent anywhere). Pure text builder, no DOM.

/** The sentence read out for one site. */
export function siteSpeech(p, headline, total) {
  const n = (v) => (Number.isFinite(v) ? Math.round(v) : "not available");
  return `Site ${p.site_id}, an example site, simulated. Ranked ${p.rank} of ${total}. ${headline} `
    + `Score ${n(p.score_total)} out of 100: heat relief ${n(p.score_cooling)}, links green areas ${n(p.score_connectivity)}, shade for walkers ${n(p.score_shade)}.`;
}

/** True when this browser can speak. */
export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance === "function";
