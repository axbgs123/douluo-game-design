import { describe, expect, it } from "vitest";
import { formatSoulCoins } from "../../shared/currency.js";

describe("soul coin formatting", () => {
  it("uses the original decimal gold, silver and copper soul coin system", () => {
    expect(formatSoulCoins(0)).toBe("0 铜魂币");
    expect(formatSoulCoins(8)).toBe("8 铜魂币");
    expect(formatSoulCoins(18)).toBe("1 银魂币 8 铜魂币");
    expect(formatSoulCoins(850)).toBe("8 金魂币 5 银魂币");
  });
});
