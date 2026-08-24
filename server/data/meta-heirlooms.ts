export { HEIRLOOMS, heirloomByName } from "../../shared/heirlooms.js";
export type { HeirloomDefinition as MetaHeirloomDefinition } from "../../shared/heirlooms.js";
import { HEIRLOOMS } from "../../shared/heirlooms.js";

export const META_HEIRLOOMS = HEIRLOOMS.filter((item) => item.summonable);
