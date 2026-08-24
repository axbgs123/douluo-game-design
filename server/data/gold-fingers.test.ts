import { describe, expect, it } from "vitest";
import { GOLD_FINGERS, goldFingerMechanicSignature } from "../../shared/gold-fingers.js";

describe("金手指目录", () => {
  it("contains exactly one hundred independently named and actionable designs", () => {
    expect(GOLD_FINGERS).toHaveLength(100);
    expect(new Set(GOLD_FINGERS.map((item) => item.id)).size).toBe(100);
    expect(new Set(GOLD_FINGERS.map((item) => item.name)).size).toBe(100);
    expect(new Set(GOLD_FINGERS.map((item) => item.actionCommand)).size).toBe(100);
  });

  it("does not reuse a trigger-cost-reward-cooldown-constraint signature", () => {
    const signatures = GOLD_FINGERS.map(goldFingerMechanicSignature);
    expect(new Set(signatures).size).toBe(100);
    for (const item of GOLD_FINGERS) {
      expect(item.hint.length).toBeGreaterThanOrEqual(24);
      expect(item.mechanic.constraint.length).toBeGreaterThanOrEqual(8);
    }
  });
});
