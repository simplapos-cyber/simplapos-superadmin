import { describe, it, expect } from "vitest";
import { ALL_NAV_ITEMS } from "../shared/navConfig";

describe("navConfig direkt", () => {
  it("hat sa-qrorpa Eintrag", () => {
    const qrorpaItem = ALL_NAV_ITEMS.find((i: any) => i.id === "sa-qrorpa");
    console.log("sa-qrorpa:", qrorpaItem);
    expect(qrorpaItem).toBeDefined();
    expect(qrorpaItem?.group).toBe("Statistiken");
  });
  it("hat 19 superadmin items", () => {
    const saItems = ALL_NAV_ITEMS.filter((i: any) => i.roles.includes("superadmin"));
    console.log("SA items count:", saItems.length);
    console.log("SA groups:", [...new Set(saItems.map((i: any) => i.group))]);
    expect(saItems.length).toBe(19);
  });
});
