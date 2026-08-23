export const COPPER_PER_SILVER = 10;
export const COPPER_PER_GOLD = 100;

export function formatSoulCoins(totalCopper: number): string {
  const safe = Math.max(0, Math.floor(totalCopper));
  const gold = Math.floor(safe / COPPER_PER_GOLD);
  const silver = Math.floor((safe % COPPER_PER_GOLD) / COPPER_PER_SILVER);
  const copper = safe % COPPER_PER_SILVER;
  const parts: string[] = [];
  if (gold) parts.push(`${gold} 金魂币`);
  if (silver) parts.push(`${silver} 银魂币`);
  if (copper || !parts.length) parts.push(`${copper} 铜魂币`);
  return parts.join(" ");
}
