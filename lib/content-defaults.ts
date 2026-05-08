import type { HomePageContent, ListingPageContent, SiteSettings } from "@/lib/types";

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  id: "site",
  appName: "Raster",
  defaultSeoTitle: "Raster - two-axis visual maps",
  defaultSeoDescription:
    "Raster maps a topic across two picturable traits and marks the cells with no picture yet.",
  metadataTitleTemplate: "%s · Raster",
  openGraphTitle: "Raster - two-axis visual maps",
  openGraphDescription:
    "Raster maps a topic across two picturable traits and marks the cells with no picture yet.",
  footerCopy: "Raster · two-axis visual maps",
  supportEmail: null,
  contactUrl: null,
  updatedAt: new Date(0).toISOString(),
  publishedAt: null,
};

export const DEFAULT_HOME_PAGE: HomePageContent = {
  key: "home",
  slug: "",
  title: "New map",
  seoTitle: "Raster - two-axis visual maps",
  seoDescription:
    "Turn a topic into a structured map of examples, gaps, and constraints.",
  heroTitle: "New map",
  heroBody: "Turn a topic into a structured map of examples, gaps, and constraints.",
  primaryCtaLabel: "Start mapping",
  primaryCtaHref: "/",
  sectionEyebrow: "Topic",
  sectionTitle: "Topic",
  sectionSummary: "Topic · Frame · Build",
};

export const DEFAULT_GALLERY_PAGE: ListingPageContent = {
  key: "gallery",
  slug: "gallery",
  title: "Maps",
  seoTitle: "Maps · Raster",
  seoDescription: "Browse published and live map experiments.",
  heading: "Maps",
  intro: "Thumbnails and titles are in the sidebar.",
  helperText: "Maps",
  emptyStateTitle: "No maps yet.",
  emptyStateBody: "Create a map to start building a browsable library.",
};

export const DEFAULT_LEADERBOARD_PAGE: ListingPageContent = {
  key: "leaderboard",
  slug: "leaderboard",
  title: "Top list",
  seoTitle: "Top List · Raster",
  seoDescription: "Frontier cells published by the community.",
  heading: "Top list",
  intro: "Frontier cells published by the community. Vote on the ones that feel right.",
  helperText: "Filter",
  emptyStateTitle: "No spotlights yet.",
  emptyStateBody: "Publish a frontier cell to seed the top list.",
};
