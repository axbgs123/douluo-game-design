import type { GameEra, Gender } from "../../shared/game";

interface CharacterPortraitProps {
  era: GameEra;
  gender: Gender;
  name: string;
  compact?: boolean;
}

export function CharacterPortrait({ era, gender, name, compact = false }: CharacterPortraitProps) {
  const assetGender = gender === "女" ? "female" : "male";
  const genderLabel = gender === "女" ? "女孩" : "男孩";
  return <figure className={`character-portrait ${compact ? "character-portrait-compact" : ""}`} data-testid="character-portrait">
    <img src={`/assets/candidate-era-${era}-${assetGender}.webp`} alt={`斗${era}时代原创${genderLabel}角色肖像`} loading="eager" />
    <figcaption><span>六岁建档肖像 · 斗{era}</span><strong>{name}</strong><small>服饰只表示时代氛围，不推定隐藏身世</small></figcaption>
  </figure>;
}
