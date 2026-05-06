/**
 * Cross-cell diversity utilities for persisted cell visualizations.
 *
 * The product goal is "discover novelty" — two cells producing
 * byte-identical images is the strongest possible signal that a
 * generation has degraded into duplication. This module exposes a
 * server-side helper that finds those duplicates, plus a prompt
 * suffix the caller can use to regenerate a near-duplicate cell with
 * a diversification cue.
 *
 * Note on "perceptual" duplicates: detecting two near-identical images
 * (different bytes, same picture) requires decoding pixels, which
 * needs an image library (e.g. `sharp`). Until that dependency is
 * added, we only detect exact byte duplicates here. The persisted
 * `byteHash` field is the substrate a future pHash upgrade will
 * compare against.
 */

import type { MapCell, MapDocument } from "@/lib/types";

export type DuplicateGroup = {
  byteHash: string;
  cellIds: string[];
};

export function findDuplicateCellVisualizations(document: MapDocument): DuplicateGroup[] {
  const byHash = new Map<string, string[]>();
  for (const cell of document.cells) {
    const hash = cell.visualization?.byteHash;
    if (!hash) continue;
    const list = byHash.get(hash) ?? [];
    list.push(cell.id);
    byHash.set(hash, list);
  }
  const out: DuplicateGroup[] = [];
  for (const [byteHash, cellIds] of byHash) {
    if (cellIds.length >= 2) {
      out.push({ byteHash, cellIds });
    }
  }
  return out;
}

/**
 * Given the cell currently being visualized and the surrounding document,
 * return any other cell whose persisted visualization shares the same byte
 * hash as the freshly produced one. Used by the action layer to detect
 * model output reuse and trigger a single diversification retry.
 */
export function findHashCollisionAgainstOthers(
  document: MapDocument,
  cellId: string,
  byteHash: string | undefined,
): MapCell | null {
  if (!byteHash) return null;
  for (const cell of document.cells) {
    if (cell.id === cellId) continue;
    if (cell.visualization?.byteHash === byteHash) {
      return cell;
    }
  }
  return null;
}

/**
 * Suffix appended to the image prompt when the prior render duplicated
 * another cell. Intentionally short so most of the original prompt is
 * preserved verbatim.
 */
export function buildDiversificationSuffix(collidingWith: MapCell): string {
  const collidedLabel = collidingWith.label.trim() || collidingWith.id;
  const coords = Object.entries(collidingWith.coordinates)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  return `\n\n## Diversity remediation
Your previous attempt produced an image byte-identical to a different cell on this map ("${collidedLabel}"; coordinates ${coords}). That means the model collapsed two distinct map positions onto one rendering. Re-render this cell so the resulting image is visibly different from that other cell — change pose, framing, material, surface treatment, or background fragment so a viewer can tell them apart at thumbnail size, while still satisfying every coordinate and the series style.`;
}
