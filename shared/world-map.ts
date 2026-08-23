export interface WorldMapPoint {
  id: string;
  name: string;
  x: number;
  y: number;
  kind: "城市" | "宗门" | "学院" | "森林" | "险地" | "海域";
  hidden?: boolean;
}

export const WORLD_MAP_POINTS: WorldMapPoint[] = [
  { id: "vast-sea-city", name: "瀚海城", x: 9, y: 33, kind: "城市" },
  { id: "clear-sky-mountain", name: "昊天宗", x: 20, y: 18, kind: "宗门", hidden: true },
  { id: "skywater-academy", name: "天水学院", x: 34, y: 12, kind: "学院" },
  { id: "heaven-dou-city", name: "天斗城", x: 37, y: 25, kind: "城市" },
  { id: "seven-treasure-fort", name: "七宝琉璃宗", x: 31, y: 29, kind: "宗门" },
  { id: "heaven-royal-academy", name: "天斗皇家学院", x: 41, y: 22, kind: "学院" },
  { id: "strength-clan-estate", name: "力之一族", x: 40, y: 29, kind: "宗门" },
  { id: "sunset-forest", name: "落日森林", x: 27, y: 35, kind: "森林" },
  { id: "ice-fire-spring", name: "冰火两仪眼", x: 25, y: 37, kind: "险地", hidden: true },
  { id: "blue-lightning-mountain", name: "蓝电霸王龙宗", x: 53, y: 21, kind: "宗门" },
  { id: "thunder-academy", name: "雷霆学院", x: 55, y: 27, kind: "学院" },
  { id: "hurricane-academy", name: "神风学院", x: 46, y: 35, kind: "学院" },
  { id: "blazing-academy", name: "炽火学院", x: 51, y: 39, kind: "学院" },
  { id: "elephant-sect-fort", name: "象甲宗", x: 57, y: 43, kind: "宗门" },
  { id: "holy-soul-village", name: "圣魂村", x: 29, y: 48, kind: "城市" },
  { id: "notting-city", name: "诺丁城", x: 33, y: 46, kind: "城市" },
  { id: "notting-academy", name: "诺丁学院", x: 34, y: 48, kind: "学院" },
  { id: "soul-hunting-forest", name: "猎魂森林", x: 38, y: 42, kind: "森林" },
  { id: "spirit-city", name: "武魂城", x: 58, y: 50, kind: "城市" },
  { id: "spirit-hall-prison", name: "裁决地牢", x: 59, y: 52, kind: "险地", hidden: true },
  { id: "suotuo-city", name: "索托城", x: 39, y: 61, kind: "城市" },
  { id: "shrek-village", name: "史莱克旧址", x: 42, y: 59, kind: "学院" },
  { id: "taixuan-valley", name: "太玄剑谷", x: 48, y: 53, kind: "宗门", hidden: true },
  { id: "star-dou-edge", name: "星斗大森林", x: 52, y: 61, kind: "森林" },
  { id: "star-dou-core", name: "星斗核心区", x: 54, y: 61, kind: "险地", hidden: true },
  { id: "longxing-city", name: "龙兴城", x: 63, y: 59, kind: "城市" },
  { id: "gengxin-city", name: "庚辛城", x: 75, y: 69, kind: "城市" },
  { id: "star-luo-city", name: "星罗城", x: 65, y: 78, kind: "城市" },
  { id: "slaughter-city", name: "杀戮之都", x: 80, y: 52, kind: "险地", hidden: true },
  { id: "purple-pearl-island", name: "紫珍珠岛", x: 12, y: 58, kind: "海域" },
  { id: "sea-god-island", name: "海神岛", x: 7, y: 73, kind: "海域" },
  { id: "whale-sea", name: "魔鲸海域", x: 19, y: 80, kind: "海域" },
];

export function worldMapPoint(id: string): WorldMapPoint {
  return WORLD_MAP_POINTS.find((point) => point.id === id) ?? WORLD_MAP_POINTS.find((point) => point.id === "notting-city")!;
}
