const COLOURS = ['#0f172a', '#1d4ed8', '#047857', '#b45309', '#7c3aed', '#be123c'];

/**
 * Deterministic avatar rendered as an inline SVG data URI.
 *
 * Keeping this server-side and dependency-free means default avatars work with
 * no external image service and no network access, and the same label always
 * produces the same colour.
 */
export function initialsAvatar(label: string, maxChars = 2): string {
  const cleaned = label.trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  const initials =
    words.length > 1
      ? `${words[0].charAt(0)}${words[1].charAt(0)}`
      : cleaned.slice(0, maxChars) || 'KS';
  const safe = initials.toUpperCase().replace(/[^A-Z0-9]/g, 'K').slice(0, maxChars) || 'KS';

  let hash = 0;
  for (const char of cleaned || 'KSITM') hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const background = COLOURS[hash % COLOURS.length];

  const fontSize = safe.length > 1 ? 52 : 64;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">` +
    `<rect width="128" height="128" rx="64" fill="${background}"/>` +
    `<text x="64" y="64" fill="#ffffff" font-family="Inter,Arial,sans-serif" font-size="${fontSize}" ` +
    `font-weight="700" text-anchor="middle" dominant-baseline="central">${safe}</text></svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
