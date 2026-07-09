import { describe, it, expect } from "vitest";
import { buildNav } from "../client/src/lib/buildNav";

describe("Debug Gruppen", () => {
  it("zeigt Gruppen-Anzahl", () => {
    const groups = buildNav({ role: "superadmin" });
    console.log("Gruppen:", groups.length, groups.map((g: any) => g.group));
    expect(groups.length).toBeGreaterThan(0);
  });
});
