const TAXONOMY_WORD_PATTERN = /\b(taxonomical|taxonomically|taxonomic|taxonomies|taxonomy)\b/gi;

export function stripTaxonomyWords(input: string): string {
  if (!input) {
    return "";
  }
  return input
    .replace(TAXONOMY_WORD_PATTERN, " ")
    .replace(/\s*[-–—:|·•]\s*(?=(\s|$))/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/^[\s\-–—:|·•,]+|[\s\-–—:|·•,]+$/g, "")
    .trim();
}

const TAXONOMY_PROBE = /\b(taxonomical|taxonomically|taxonomic|taxonomies|taxonomy)\b/i;

/** True if any forbidden taxonomy-family word appears (aligned with stripTaxonomyWords). */
export function textContainsTaxonomyWord(input: string): boolean {
  return TAXONOMY_PROBE.test(input);
}
