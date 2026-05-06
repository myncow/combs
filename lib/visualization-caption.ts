import type { MapCell } from "@/lib/types";

function collapseWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function cleanCaption(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  let text = raw;
  text = text.replace(/data:image\/[^;\s]+;base64,[A-Za-z0-9+/=]+/g, "");
  text = text.replace(/```[\s\S]*?```/g, "");
  text = text.replace(/```/g, "");
  text = text.replace(/"image_url"\s*:\s*\{[^}]*\}/g, "");
  text = text.replace(/"image_url"\s*:\s*"[^"]*"/g, "");
  text = text.replace(/"image_url"\s*:/g, "");
  text = text.replace(/!\[[^\]]*\]\(\s*\)/g, "");
  text = collapseWhitespace(text);
  if (text.length < 4) return undefined;
  const letters = text.match(/[A-Za-z]/g)?.length ?? 0;
  if (letters < 4) return undefined;
  const lowerLetters = text.match(/[a-z]/g)?.length ?? 0;
  if (letters >= 8 && lowerLetters === 0) return undefined;
  return text.slice(0, 2000);
}

function stripBoilerplateLeadIn(text: string) {
  return text
    .replace(/^here(?:'s| is)\s+(?:an?\s+)?image\b[^:]*:\s*/i, "")
    .replace(/^here(?:'s| is)\s+/i, "")
    .replace(/^(?:image|caption)\s*:\s*/i, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .trim();
}

function fallbackCaptionFor(cell: Pick<MapCell, "label" | "examples">) {
  return cell.examples[0]?.name?.trim() || cell.label.trim();
}

export function finalizeVisualizationCaption(
  raw: string | undefined | null,
  cell: Pick<MapCell, "label" | "status" | "examples">,
): string | undefined {
  if (cell.status === "gap" || cell.status === "tension" || cell.status === "impossible") {
    return cell.label.trim();
  }

  const cleaned = cleanCaption(raw);
  if (!cleaned) return undefined;

  let text = stripBoilerplateLeadIn(cleaned);
  if (!text) return fallbackCaptionFor(cell);

  if (/[.!?]\s+[A-Z]/.test(text)) {
    text = text.split(/(?<=[.!?])\s+(?=[A-Z])/)[0] ?? text;
  }

  text = collapseWhitespace(text).replace(/^["'“”]+|["'“”]+$/g, "").trim();
  if (!text) return fallbackCaptionFor(cell);

  if (text.length > 120) {
    return fallbackCaptionFor(cell);
  }

  if (/\b(?:illustrating|showing|reflecting|captures|depicting)\b/i.test(text) && text.length > 60) {
    return fallbackCaptionFor(cell);
  }

  return text;
}
