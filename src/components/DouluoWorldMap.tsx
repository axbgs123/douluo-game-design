import type { MouseEvent } from "react";
import type { GameEra, MapPinView } from "../../shared/game";
import { WORLD_MAP_POINTS, type WorldMapPoint } from "../../shared/world-map";

export interface AtlasMarker {
  id: string;
  label: string;
  detail?: string;
  x: number;
  y: number;
  tone: "current" | "objective" | "candidate-1" | "candidate-2" | "candidate-3";
  onClick?: () => void;
}

interface DouluoWorldMapProps {
  era?: GameEra;
  landmarks?: Array<WorldMapPoint & { muted?: boolean }>;
  markers?: AtlasMarker[];
  pins?: MapPinView[];
  zoom?: number;
  onCanvasClick?: (x: number, y: number) => void;
  onPinRemove?: (id: string) => void;
}

export function DouluoWorldMap({
  era = 1,
  landmarks = WORLD_MAP_POINTS.filter((point) => !point.hidden),
  markers = [],
  pins = [],
  zoom = 1,
  onCanvasClick,
  onPinRemove,
}: DouluoWorldMapProps) {
  const regionLabels = {
    1: ["天斗帝国", "星罗帝国", "西海"],
    2: ["天魂与斗灵", "星罗帝国", "西海"],
    3: ["斗罗大陆", "星罗大陆", "远海"],
    4: ["斗罗联邦", "星际航域", "宇宙"],
  } as const;
  const [westernRegion, easternRegion, surroundingRegion] = regionLabels[era];
  const placePin = (event: MouseEvent<SVGSVGElement>) => {
    if (!onCanvasClick || (event.target as Element).closest("[data-map-control]")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    onCanvasClick(
      Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
      Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)),
    );
  };

  return <div className="douluo-map-scroll">
    <svg
      className="douluo-world-map"
      style={{ width: `${zoom * 100}%` }}
      viewBox="0 0 1000 640"
      role="img"
      aria-label={`斗罗大陆第${era}时代交互地图`}
      onClick={placePin}
    >
      <defs>
        <linearGradient id="map-sea" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#dce8e7" /><stop offset="1" stopColor="#b9d0cf" /></linearGradient>
        <linearGradient id="map-land" x1="0" y1="0" x2=".8" y2="1"><stop stopColor="#eee2bd" /><stop offset=".55" stopColor="#d9c98f" /><stop offset="1" stopColor="#c4af73" /></linearGradient>
        <filter id="map-shadow"><feDropShadow dx="0" dy="7" stdDeviation="8" floodColor="#4f442b" floodOpacity=".2" /></filter>
      </defs>
      <rect width="1000" height="640" rx="18" fill="url(#map-sea)" />
      <path className="map-wave" d="M15 185 Q105 155 195 185 T375 185 M640 90 Q735 60 825 90 T995 90 M5 525 Q100 495 195 525" />
      <path className="map-landmass" filter="url(#map-shadow)" d="M168 63 C268 14 447 34 544 84 C654 140 714 218 824 258 C897 285 949 358 917 433 C886 508 789 555 677 571 C551 590 433 554 330 520 C231 487 151 424 135 334 C122 257 102 156 168 63 Z" />
      <path className="map-border" d="M548 96 C514 183 522 265 572 333 C607 382 611 454 574 548" />
      <path className="map-river" d="M344 92 C326 173 375 224 347 292 C322 353 356 407 426 456 C473 489 482 533 466 557" />
      <path className="map-river" d="M661 189 C624 242 653 296 618 347 C594 381 588 434 609 485" />
      <g className="map-mountains" aria-hidden="true">
        <path d="M172 154 l28 -43 27 43 22 -33 29 45 M461 128 l24 -39 25 39 20 -27 25 38 M742 345 l25 -42 28 42 19 -29 26 37" />
      </g>
      <g className="map-forest" aria-hidden="true">
        {[[250,238],[278,250],[301,231],[485,374],[520,388],[552,375],[509,420],[566,413],[719,458]].map(([x,y], index) => <path key={index} d={`M${x} ${y} l10 -18 10 18 h-7 l9 15 h-24 l9 -15z`} />)}
      </g>
      <text className="map-region-title" x="335" y="115">{westernRegion}</text>
      <text className="map-region-title" x="675" y="475">{easternRegion}</text>
      <text className="map-sea-title" x="40" y="410">{surroundingRegion}</text>
      {landmarks.map((point) => <g key={point.id} className={`atlas-landmark kind-${point.kind} ${point.muted ? "muted" : ""}`} transform={`translate(${point.x * 10} ${point.y * 6.4})`}>
        <circle r="5" />
        <text y="-10" textAnchor="middle">{point.name}</text>
      </g>)}
      {pins.map((pin) => <g key={pin.id} data-map-control className="atlas-pin" transform={`translate(${pin.x * 10} ${pin.y * 6.4})`} onClick={(event) => { event.stopPropagation(); onPinRemove?.(pin.id); }}>
        <path d="M0 12 C-4 3 -10 -1 -10 -9 A10 10 0 1 1 10 -9 C10 -1 4 3 0 12Z" />
        <circle cy="-9" r="3" />
        <text y="27" textAnchor="middle">{pin.label}</text>
      </g>)}
      {markers.map((marker) => <g key={marker.id} data-map-control className={`atlas-marker marker-${marker.tone}`} transform={`translate(${marker.x * 10} ${marker.y * 6.4})`} onClick={(event) => { event.stopPropagation(); marker.onClick?.(); }}>
        <circle r="12" />
        <circle r="4" />
        <text y="-18" textAnchor="middle">{marker.label}</text>
        {marker.detail && <text className="marker-detail" y="27" textAnchor="middle">{marker.detail}</text>}
      </g>)}
      <g className="map-compass" transform="translate(930 77)" aria-hidden="true"><circle r="31" /><path d="M0 -25 L7 0 0 25 -7 0Z" /><text y="-37" textAnchor="middle">北</text></g>
    </svg>
  </div>;
}
