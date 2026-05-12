type Viewer = {
  id: string;
  isAdmin: boolean;
} | null;

type OwnedVisibilityResource = {
  isPublic?: boolean;
  createdByNeonUserId?: string | null;
};

type OwnedResource = {
  createdByNeonUserId?: string | null;
};

export function viewerCanReadMap(
  map: OwnedVisibilityResource,
  viewer: Viewer,
): boolean {
  if (map.isPublic) return true;
  if (!viewer) return false;
  if (viewer.isAdmin) return true;
  return map.createdByNeonUserId === viewer.id;
}

export function viewerCanMutateMap(
  map: OwnedResource,
  viewer: Viewer,
): boolean {
  if (!viewer) return false;
  if (viewer.isAdmin) return true;
  return map.createdByNeonUserId === viewer.id;
}
