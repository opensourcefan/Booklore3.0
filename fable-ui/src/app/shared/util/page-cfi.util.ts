/**
 * Parses page-position CFIs used by PDF and CBX bookmarks/notes.
 * Accepts plain page numbers ("12") and page= forms ("page=12", "page=12:uuid").
 */
export function parsePageCfi(cfi?: string | null): number | null {
  if (cfi == null) {
    return null;
  }
  const trimmed = cfi.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith('page=')) {
    const raw = trimmed.slice(5).split(':')[0];
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? n : null;
}
