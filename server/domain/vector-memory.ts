export const VECTOR_MEMORY_DIMENSIONS = 384;

const SEMANTIC_GROUPS: Array<[string, RegExp]> = [
  ["猎魂魂兽魂环承载", /猎魂|魂兽|魂环|年限|承载|吸收|猎杀|森林/g],
  ["修炼魂力突破瓶颈", /修炼|魂力|突破|瓶颈|冥想|等级|进阶/g],
  ["关系承诺信任人情", /关系|承诺|信任|朋友|同伴|导师|家人|人情|背叛/g],
  ["宗门学院势力权限", /宗门|学院|势力|武魂殿|史莱克|唐门|传灵塔|权限|名额/g],
  ["战斗伤势敌人胜负", /战斗|攻击|防御|受伤|伤势|敌人|胜利|失败|撤退/g],
  ["物品金钱交易资源", /物品|金魂币|货币|购买|出售|交易|材料|资源|库存/g],
  ["秘密身份武魂血脉", /秘密|身份|身世|武魂|血脉|隐藏|暴露|觉醒/g],
  ["任务线索调查情报", /任务|线索|调查|证据|情报|消息|核验|档案/g],
  ["旅行地点地图路程", /前往|旅行|地点|地图|路程|抵达|离开|城|村|森林/g],
  ["魂导魂灵斗铠机甲星舰", /魂导|魂灵|斗铠|机甲|升灵台|星舰|舰队|驾驶/g],
];

function hashFeature(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function normalizedText(text: string): string {
  const compact = text.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
  const semantic = SEMANTIC_GROUPS.filter(([, pattern]) => {
    pattern.lastIndex = 0;
    return pattern.test(compact);
  }).map(([label]) => label).join("");
  return `${compact}${semantic}`.slice(0, 8_000);
}

export function embedMemoryText(text: string): Float32Array {
  const normalized = normalizedText(text);
  const vector = new Float32Array(VECTOR_MEMORY_DIMENSIONS);
  const add = (feature: string, weight: number) => {
    const hash = hashFeature(feature);
    const index = hash % VECTOR_MEMORY_DIMENSIONS;
    vector[index] += (hash & 0x80000000 ? -1 : 1) * weight;
  };
  for (let index = 0; index < normalized.length; index += 1) {
    add(`u:${normalized[index]}`, 0.35);
    if (index + 1 < normalized.length) add(`b:${normalized.slice(index, index + 2)}`, 1);
    if (index + 2 < normalized.length) add(`t:${normalized.slice(index, index + 3)}`, 0.65);
  }
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm);
  if (norm > 0) for (let index = 0; index < vector.length; index += 1) vector[index] /= norm;
  return vector;
}

export function vectorSimilarity(left: Float32Array, right: Float32Array): number {
  const length = Math.min(left.length, right.length);
  let score = 0;
  for (let index = 0; index < length; index += 1) score += left[index] * right[index];
  return Math.max(-1, Math.min(1, score));
}

export function vectorToBytes(vector: Float32Array): Uint8Array {
  return new Uint8Array(vector.buffer.slice(vector.byteOffset, vector.byteOffset + vector.byteLength));
}

export function bytesToVector(bytes: Uint8Array): Float32Array {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Float32Array(copy.buffer);
}
