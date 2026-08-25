import { describe, expect, it } from "vitest";
import { bytesToVector, embedMemoryText, vectorSimilarity, vectorToBytes, VECTOR_MEMORY_DIMENSIONS } from "./vector-memory.js";

describe("本地向量记忆", () => {
  it("embeds Chinese memories deterministically and preserves vectors through SQLite bytes", () => {
    const first = embedMemoryText("在星斗大森林追踪曼陀罗蛇，为第一魂环做准备");
    const second = embedMemoryText("前往森林猎杀魂兽，吸收自己的第一魂环");
    const unrelated = embedMemoryText("在学院食堂购买晚饭并核对金魂币");
    expect(first).toHaveLength(VECTOR_MEMORY_DIMENSIONS);
    expect(vectorSimilarity(first, second)).toBeGreaterThan(vectorSimilarity(first, unrelated));
    expect([...bytesToVector(vectorToBytes(first))]).toEqual([...first]);
  });
});
