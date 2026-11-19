# 🎨 Asset Replacement Guide (무중단 핫스왑 에셋 교체 가이드)

본 게임은 `public/assets/` 경로에 실제 외부 도트 스프라이트 시트(`.png`), 바이옴 타일셋 아틀라스(`.png`), 레트로 오디오(`.ogg`) 파일을 배치하면 **코드 수정 없이 자동으로 외부 에셋(`EXTERNAL_PNG` / `EXTERNAL_OGG`)으로 핫스왑**됩니다.  
외부 파일이 아직 없는 항목은 오프스크린 픽셀 베이커(`BAKED_FALLBACK`)와 4채널 Web Audio 칩튠 시퀀서(`CHIPTUNE_FALLBACK`)가 자동으로 대체합니다.

---

## 1. 디렉터리 구조 (`public/assets/`)

```text
public/assets/
├── sprites/
│   ├── luffy_base.png
│   ├── luffy_gear_5.png
│   ├── lucci_leopard_hybrid.png
│   ├── kaido_azure_dragon.png
│   ├── raid_saturn_abyss_base.png
│   ├── ship_going_merry.png
│   └── ... (src/data/assets/sprites.json 참조)
├── tilesets/
│   ├── sea_east_blue.png
│   ├── sea_grand_line.png
│   ├── sea_new_world.png
│   ├── wano_castle.png
│   ├── egghead_cyber.png
│   ├── elbaf_giant.png
│   └── ... (src/data/assets/tilesets.json 참조)
└── audio/
    ├── bgm/
    │   ├── title_adventure.ogg
    │   ├── sea_east_blue.ogg
    │   ├── battle_yonko_awakening.ogg
    │   └── ... (총 10곡, src/data/assets/audio.json 참조)
    └── sfx/
        ├── slash_light.ogg
        ├── just_dodge_chime.ogg
        ├── awakening_drums.ogg
        └── ... (총 18종, src/data/assets/audio.json 참조)
```

---

## 2. 캐릭터·보스·선박 스프라이트 시트 규격 (Aseprite Export 기준)

- **매니페스트:** `src/data/assets/sprites.json`
- **파일명 규칙:** `{unitId}_{formId}.png` (예: `luffy_base.png`, `luffy_gear_5.png`, `ship_thousand_sunny.png`)
- **프레임 규격 (`frameWidth × frameHeight`):**
  - `32 × 32`: 표준 캐릭터 (루피, 조로, 나미, 상디, 버기 등)
  - `48 × 48`: 중형 보스 · 동물계 인수형 (루치 인수형, 도플라밍고, 마젤란, 선박 등)
  - `96 × 96`: 동물형 · 거대 보스 · 협동 레이드 보스 (카이도 청룡, 새턴 성, 로키 등)
- **피벗(Anchor):** 기본 `{ x: 0.5, y: 0.85 }` (발밑 중심 정렬)
- **권장 시트 그리드:** **6열(Columns) × 11행(Rows)** 투명 배경 PNG (`imageSmoothingEnabled = false` 정수 픽셀 렌더링)

### 표준 11행(Row) 애니메이션 순서

| Row | 상태 ID | 용도 | 기본 프레임 수 | 루프 | 비고 |
| --- | --- | --- | :---: | :---: | --- |
| 0 | `IDLE` | 대기 호흡 | 4 | O | |
| 1 | `MOVE` | 걷기/달리기 | 6 | O | |
| 2 | `WINDUP` | 스킬 선딜레이 모으기 | 3 | X | |
| 3 | `ATTACK_MELEE` | 근접 베기/타격 | 4 | X | `hitFrame: 2` 동기화 |
| 4 | `ATTACK_CAST` | 투사체·광선·설치 시전 | 3 | X | `hitFrame: 1` 동기화 |
| 5 | `CLASH` | 광선·근접 맞대결 힘겨루기 | 2 | O | |
| 6 | `DODGE` | 회피 대시/잔상 | 2 | X | |
| 7 | `HIT` | 피격 경직 | 2 | X | 80ms 백색 플래시 자동 합성 |
| 8 | `DOWNED` | 쓰러짐 / 레이드 다운 | 2 | O | |
| 9 | `TRANSFORM` | 동물계 변신 / 열매 각성 | 4 | X | |
| 10 | `VICTORY` | 승리 포즈 | 4 | O | |

> **팁:** Aseprite에서 `File → Export Sprite Sheet` 선택 후 **By Rows**, **Padding = 0**, **Trim = OFF**로 내보내면 바로 호환됩니다. 무장색 패기 흑화, 피격 백색 플래시, 구름 띠, 패왕색 번개는 엔진이 오프스크린 캐시 레이어로 자동 합성합니다.

---

## 3. 해역·섬 바이옴 타일셋 규격 (`tilesets.json`)

- **파일명 규칙:** `public/assets/tilesets/{biomeId}.png`
- **타일 규격:** `16 × 16` 픽셀 (게임 캔버스에서 `2x` 정수 배율 → `32 × 32`로 렌더링)
- **아틀라스 그리드:** **16열 × 4행** (`256 × 64` px)
  - **Row 0 (Cols 0~15):** 4방향 카디널 비트마스크(`N=1, E=2, S=4, W=8`) 오토타일 16종
  - **Row 1 (Cols 0~3):** 4프레임 애니메이션 타일 (해역 물결, 운하, 용암, 빙결, 에그헤드 레이저)
  - **Row 2 (Cols 0~3):** 벽면 / 절벽 / 건물 외벽 타일 4종
  - **Row 3 (Cols 0~3):** 장식 오버레이 (벚꽃 잎, 산호, 모래 언덕, 사이버 패널 등)

---

## 4. 레트로 오디오 규격 (`audio.json`)

- **권장 포맷:** **Ogg Vorbis (`.ogg`)**, 44.1kHz Stereo(BGM) / Mono(SFX)
- **BGM (`public/assets/audio/bgm/{id}.ogg`):**
  - `audio.json`의 `loopStartSec`, `loopEndSec` 값으로 Web Audio `AudioBufferSourceNode` 심리스 루프를 제어합니다.
  - 씬 전환·보스 2페이즈·열매 각성 시 자동으로 `0.6초` 크로스페이드됩니다.
- **SFX (`public/assets/audio/sfx/{id}.ogg`):**
  - 다단 히트 클리핑 방지를 위해 동일 효과음은 `50ms` 내 최대 `3회`로 자동 스로틀링되며 `±6%` 피치 변주가 적용됩니다.

---

## 5. 교체 후 검증 방법

1. **CLI 무결성 검증:**
   ```bash
   npm run validate:assets
   ```
   모든 유닛/폼/해역/섬/오디오 매니페스트 누락 여부와 외부 교체된 파일 수(`EXTERNAL_PNG` / `EXTERNAL_OGG`)를 즉시 확인할 수 있습니다.
2. **인게임 실시간 프리뷰 (`AssetPreviewScene`):**
   - 게임 상단 바의 **`🎨 에셋 프리뷰`** 버튼 또는 Debug 드롭다운에서 `AssetPreviewScene`을 열어 캐릭터 11상태·이펙트·배율(`1x/2x/3x`), 14개 바이옴 타일셋, BGM 10종·SFX 18종을 즉시 테스트하고 우측 상단 배지가 `EXTERNAL_PNG` / `EXTERNAL_OGG`로 전환되었는지 확인하세요.
