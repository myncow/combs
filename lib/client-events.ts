export const LIBRARY_REFRESH_EVENT = "raster:library-refresh";

export function dispatchLibraryRefresh() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(LIBRARY_REFRESH_EVENT));
}
