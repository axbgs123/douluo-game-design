import type { Gender } from "../../shared/game.js";

function convertOutsideDialogue(text: string, name: string, gender: Gender): string {
  const pronoun = gender === "女" ? "她" : "他";
  const plural = `${name}一行人`;
  return text
    .replaceAll("我们", plural)
    .replaceAll("我的", `${pronoun}的`)
    .replaceAll("我", pronoun)
    .split("\n\n")
    .map((paragraph) => paragraph.replace(new RegExp(`^${pronoun}`), name))
    .join("\n\n");
}

export function toThirdPersonNarrative(text: string, name: string, gender: Gender): string {
  const parts = text.split(/([“「『][\s\S]*?[”」』])/g);
  return parts.map((part, index) => index % 2 === 1 ? part : convertOutsideDialogue(part, name, gender)).join("");
}

