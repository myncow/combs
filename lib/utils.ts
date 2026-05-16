import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { MapDocument } from "@/lib/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64);
}

export function titleCase(value: string) {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const match = raw.match(/```json\s*([\s\S]*?)```/i) ?? raw.match(/({[\s\S]*})/);
    if (!match) {
      return null;
    }
    try {
      return JSON.parse(match[1]) as T;
    } catch {
      return null;
    }
  }
}

export function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export function googleImagesSearchUrl(query: string): string {
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`;
}

export function exampleImageSearchQuery(example: {
  name?: string;
  brand?: string;
  year?: string;
}): string {
  // Image-search queries are most effective when the subject *is* the query.
  // In our dataset `brand` is usually a taxonomic family, museum, agency, or
  // era ("Cactaceae", "USDA NRCS", "Ptolemaic Egypt"), and `year` is often a
  // bucket like "Historical" or "1st-2nd Century AD". Prepending either kind
  // of context to the name reliably drops Google Images to zero results — the
  // db audit found 32% of examples with no images at all under the old
  // [brand, name, year] join. Strategy: name as the spine, brand appended only
  // when the name is short enough that disambiguation is genuinely useful AND
  // brand isn't already substring-present in the name.
  const name = (example.name ?? "").trim().replace(/\s+/g, " ");
  if (!name) {
    return "";
  }
  const brand = (example.brand ?? "").trim().replace(/\s+/g, " ");
  if (!brand) {
    return name;
  }
  if (name.toLowerCase().includes(brand.toLowerCase())) {
    return name;
  }
  const nameWordCount = name.split(" ").length;
  if (nameWordCount > 2) {
    return name;
  }
  return `${name} ${brand}`;
}

/** Matches server `normalizeExampleImageQuery` minimum length; safe for RSC + client. */
export function exampleHasImageQuery(query: string): boolean {
  return query.trim().length >= 2;
}

export function simplifyMapDisplayTitle(title: string, topicFamily?: string): string {
  let next = title.trim().replace(/\s+map$/i, "").trim();

  if (topicFamily) {
    const familyWords = topicFamily.trim().split(/\s+/).filter(Boolean);
    const trailingWord = familyWords.at(-1);
    if (trailingWord) {
      next = next.replace(new RegExp(`\\s+${trailingWord}$`, "i"), "").trim();
    }
  }

  return next || title;
}

/**
 * Pick a representative thumbnail URL for a map without ever hitting the
 * network. Reads only data that's already persisted on the saved document:
 *
 *   1. First cell (reading order) with an AI-generated visualization.
 *   2. First featured example reference image.
 *   3. First cell example reference image anywhere in the grid.
 *
 * Returns `null` when the document has no usable imagery — callers fall
 * back to a synthetic placeholder rather than rendering a broken <img>.
 */
export function pickMapThumbnail(document: MapDocument | null | undefined): string | null {
  if (!document) {
    return null;
  }
  for (const cell of document.cells ?? []) {
    if (cell.visualization?.imageUrl) {
      return cell.visualization.imageUrl;
    }
  }
  for (const example of document.featuredExamples ?? []) {
    const img = example.referenceImages?.[0];
    if (img?.thumbnail) return img.thumbnail;
    if (img?.link) return img.link;
  }
  for (const cell of document.cells ?? []) {
    for (const example of cell.examples ?? []) {
      const img = example.referenceImages?.[0];
      if (img?.thumbnail) return img.thumbnail;
      if (img?.link) return img.link;
    }
  }
  return null;
}
