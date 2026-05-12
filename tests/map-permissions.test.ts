import { describe, expect, it } from "vitest";
import { viewerCanMutateMap, viewerCanReadMap } from "@/lib/auth/permissions";

describe("map permissions", () => {
  const publicMap = { isPublic: true, createdByNeonUserId: "owner" };
  const privateMap = { isPublic: false, createdByNeonUserId: "owner" };

  it("lets everyone read public maps but only owners/admins mutate them", () => {
    expect(viewerCanReadMap(publicMap, null)).toBe(true);
    expect(viewerCanReadMap(publicMap, { id: "viewer", isAdmin: false })).toBe(true);
    expect(viewerCanMutateMap(publicMap, { id: "viewer", isAdmin: false })).toBe(false);
    expect(viewerCanMutateMap(publicMap, { id: "owner", isAdmin: false })).toBe(true);
    expect(viewerCanMutateMap(publicMap, { id: "admin", isAdmin: true })).toBe(true);
  });

  it("keeps private maps owner/admin only", () => {
    expect(viewerCanReadMap(privateMap, null)).toBe(false);
    expect(viewerCanReadMap(privateMap, { id: "viewer", isAdmin: false })).toBe(false);
    expect(viewerCanReadMap(privateMap, { id: "owner", isAdmin: false })).toBe(true);
    expect(viewerCanReadMap(privateMap, { id: "admin", isAdmin: true })).toBe(true);
  });
});
