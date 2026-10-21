// Rank labels: a circle for one or two digits, a wider pill for three or more, so a rank like 100 never spills out of its label.
// Pure helpers, no DOM. Used by the map badges (map.js) and the ranked list (list.js).

export const BADGE_HEIGHT = 26;   // px; also the width of a one- or two-digit map label

/** Digits in a rank (at least 1; anything that is not a number counts as 0). */
const digitsOf = (rank) => String(Math.max(0, Math.trunc(Number(rank) || 0))).length;

/** Width in px of the map label for a rank: 26 for one or two digits, then 8 more for each extra digit. */
export function badgeWidth(rank) {
  return BADGE_HEIGHT + 8 * Math.max(0, digitsOf(rank) - 2);
}

/** Least distance in px between the centres of two map labels so they do not touch: half of each width plus a 2 px gap. */
export function badgeSpacing(widthA, widthB) {
  return (widthA + widthB) / 2 + 2;
}

/** Width in px of the rank column in the list: 28 for up to two digits, wider for the longest rank shown (capped at six digits). */
export function rankColumnWidth(ranks) {
  const digits = Math.min(6, Math.max(1, ...ranks.map(digitsOf)));
  return Math.max(28, 16 + 8 * digits);
}
