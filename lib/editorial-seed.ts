import type { HomePageContent, ListingPageContent, SiteSettings } from "@/lib/types";

export const SEEDED_SITE_SETTINGS: SiteSettings = {
  id: "site",
  appName: "Lelet",
  defaultSeoTitle: "Lelet — a map of what's missing",
  defaultSeoDescription:
    "Lelet maps a topic across two picturable traits and surfaces the finds — the cells nothing has filled yet.",
  metadataTitleTemplate: "%s · Lelet",
  openGraphTitle: "Lelet — a map of what's missing",
  openGraphDescription:
    "Lelet maps a topic across two picturable traits and surfaces the finds — the cells nothing has filled yet.",
  footerCopy: "Lelet · noun, Hungarian — a find",
  supportEmail: null,
  contactUrl: null,
  updatedAt: new Date(0).toISOString(),
  publishedAt: null,
};

export const SEEDED_HOME_PAGE: HomePageContent = {
  key: "home",
  slug: "",
  title: "New map",
  seoTitle: "Lelet — a map of what's missing",
  seoDescription: "Turn a topic into a structured map of examples, gaps, and constraints.",
  heroTitle: "New map",
  heroBody: "Turn a topic into a structured map of examples, gaps, and constraints.",
  primaryCtaLabel: "Start mapping",
  primaryCtaHref: "/",
  sectionEyebrow: "Topic",
  sectionTitle: "Topic",
  sectionSummary: "Topic · Frame · Build",
};

export const SEEDED_GALLERY_PAGE: ListingPageContent = {
  key: "gallery",
  slug: "maps",
  title: "Maps",
  seoTitle: "Maps · Lelet",
  seoDescription: "Browse published and live map experiments.",
  heading: "Maps",
  intro: "Thumbnails and titles are in the sidebar.",
  helperText: "Maps",
  emptyStateTitle: "No maps yet.",
  emptyStateBody: "Create a map to start building a browsable library.",
};

export const SEEDED_LEADERBOARD_PAGE: ListingPageContent = {
  key: "leaderboard",
  slug: "finds",
  title: "Finds",
  seoTitle: "Finds · Lelet",
  seoDescription: "Finds published by the community — gaps surfaced from Lelet maps.",
  heading: "Finds",
  intro: "Each entry is a find — a gap someone surfaced from a Lelet map. Vote on the ones that feel right.",
  helperText: "Filter",
  emptyStateTitle: "No finds yet.",
  emptyStateBody: "Publish a find to seed the wall.",
};
