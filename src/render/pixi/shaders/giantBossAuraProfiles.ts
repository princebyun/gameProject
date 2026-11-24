export type BossAuraStyle =
  | 'CONQUEROR_DRAGON'
  | 'TOXIC_YOKAI'
  | 'MYTHIC_THUNDER'
  | 'LIGHT_MIRROR'
  | 'ROOM_DOME'
  | 'FORESIGHT_MOCHI'
  | 'BLACK_HAGOROMO'
  | 'STRING_CAGE';

export interface GiantBossAuraProfile {
  unitId: string;
  auraStyle: BossAuraStyle;
  rimColorHex: number;
  secondaryColorHex: number;
  lightRadiusPx: number;
  phase2Headline: string;
  phase2Subline: string;
  hasChromaticForesight?: boolean;
  hasGlareShockwave?: boolean;
  hasGroundCrackDecals?: boolean;
}

const BOSS_AURA_PROFILES: Readonly<Record<string, GiantBossAuraProfile>> = {
  kaido: {
    unitId: 'kaido',
    auraStyle: 'CONQUEROR_DRAGON',
    rimColorHex: 0xa855f7,
    secondaryColorHex: 0x2dd4bf,
    lightRadiusPx: 175,
    phase2Headline: '카이도 — 화룡대횃불 · 패왕색 해방!',
    phase2Subline: '용의 불꽃과 검은 번개가 전장을 뒤덮습니다!'
  },
  saturn: {
    unitId: 'saturn',
    auraStyle: 'TOXIC_YOKAI',
    rimColorHex: 0x7e22ce,
    secondaryColorHex: 0xf43f5e,
    lightRadiusPx: 170,
    phase2Headline: '새턴 성 — 심연 오로성 우규 각성!',
    phase2Subline: '안광 시선 충격파와 맹독 구름을 경계하십시오!',
    hasGlareShockwave: true
  },
  loki: {
    unitId: 'loki',
    auraStyle: 'MYTHIC_THUNDER',
    rimColorHex: 0xfacc15,
    secondaryColorHex: 0xbae6fd,
    lightRadiusPx: 185,
    phase2Headline: '왕자 로키 — 라그니르 태양 파괴 낙뢰!',
    phase2Subline: '거대 철뇌 내려찍기 지면 균열과 낙뢰를 회피하십시오!',
    hasGroundCrackDecals: true
  },
  kizaru: {
    unitId: 'kizaru',
    auraStyle: 'LIGHT_MIRROR',
    rimColorHex: 0xfef08a,
    secondaryColorHex: 0xfbbf24,
    lightRadiusPx: 140,
    phase2Headline: '대장 키자루 — 팔상경 광속 영역!',
    phase2Subline: '황금 광선 난사가 시작됩니다!'
  },
  law: {
    unitId: 'law',
    auraStyle: 'ROOM_DOME',
    rimColorHex: 0x38bdf8,
    secondaryColorHex: 0xfacc15,
    lightRadiusPx: 135,
    phase2Headline: '트라팔가 로 — K·ROOM 수술실 전개!',
    phase2Subline: '공간 굴절 지배 영역이 활성화되었습니다!'
  },
  katakuri: {
    unitId: 'katakuri',
    auraStyle: 'FORESIGHT_MOCHI',
    rimColorHex: 0xe879f9,
    secondaryColorHex: 0xf43f5e,
    lightRadiusPx: 135,
    phase2Headline: '카타쿠리 — 미래 예지 · 무쌍 도넛!',
    phase2Subline: '견문색 미래 예지로 공격 궤도를 꿰뚫어봅니다!',
    hasChromaticForesight: true
  },
  lucci: {
    unitId: 'lucci',
    auraStyle: 'BLACK_HAGOROMO',
    rimColorHex: 0x6366f1,
    secondaryColorHex: 0xfacc15,
    lightRadiusPx: 130,
    phase2Headline: '로브 루치 — 각성 레오파드 · 검은 구름 띠!',
    phase2Subline: '초고속 육식 연격이 강화됩니다!'
  },
  doflamingo: {
    unitId: 'doflamingo',
    auraStyle: 'STRING_CAGE',
    rimColorHex: 0xf43f5e,
    secondaryColorHex: 0xfb7185,
    lightRadiusPx: 145,
    phase2Headline: '도플라밍고 — 실실 열매 각성 · 새장 전개!',
    phase2Subline: '전장이 붉은 실로 포위되어 수축하기 시작합니다!'
  }
};

export function getBossAuraProfile(speciesId: string): GiantBossAuraProfile | null {
  return BOSS_AURA_PROFILES[speciesId] ?? null;
}
