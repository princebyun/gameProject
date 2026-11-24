import { activateFormShift } from '../../core/combat/formShiftEngine';
import { exitIslandToSea } from '../../core/rpg/episodeEngine';
import type { Disposable } from '../sceneTypes';
import type { SceneManagerHost } from './controllerContracts';

export class SceneShowcaseToolbarController implements Disposable {
  constructor(private readonly host: SceneManagerHost) {}

  public dispose(): void {
    if (this.host.showcaseBarEl) {
      this.host.showcaseBarEl.innerHTML = '';
    }
  }

  public updateShowcaseToolbar(): void {
    const bar = this.host.showcaseBarEl;
    if (!bar) return;

    if (this.host.activeScene === 'SEA_SAILING') {
      bar.innerHTML = `
        <button id="btn-act-interact" class="btn-tab-active">⚓ 섬 입항 / 관문 진입 [E]</button>
        <button id="btn-act-coup" class="btn-showcase">🚀 쿠 드 버스트 [Shift]</button>
        <button id="btn-act-online" style="background:#581c87;border-color:#c084fc;">🌐 실시간 통신 대전 로비</button>
        <button id="btn-act-save" class="btn-showcase">💾 빠른 수동 저장 (SLOT 1)</button>
      `;
      bar.querySelector('#btn-act-interact')?.addEventListener('click', () => {
        this.host.pendingRpgInteract = true;
      });
      bar.querySelector('#btn-act-coup')?.addEventListener('click', () => {
        this.host.pendingCoupDeBurst = true;
      });
      bar.querySelector('#btn-act-online')?.addEventListener('click', () => {
        this.host.openOnlineLobbyModal(false);
      });
      bar.querySelector('#btn-act-save')?.addEventListener('click', () => {
        void this.host.saveToSlot('slot_1');
      });
    } else if (this.host.activeScene === 'ISLAND_EPISODE') {
      bar.innerHTML = `
        <button id="btn-isl-interact" class="btn-tab-active">💬 대화 / 퍼즐 스위치 / 보스전 [E]</button>
        <button id="btn-isl-terminal" style="background:#581c87;border-color:#c084fc;">🌐 항구 대전 단말기 접속 (아이템금지/HP무손실)</button>
        <button id="btn-isl-clear" class="btn-showcase">★ 현재 섬 에피소드 즉시 완료</button>
        <button id="btn-isl-exit" class="btn-showcase">⚓ 항구 출구 (바다 복귀)</button>
      `;
      bar.querySelector('#btn-isl-interact')?.addEventListener('click', () => {
        this.host.pendingRpgInteract = true;
      });
      bar.querySelector('#btn-isl-terminal')?.addEventListener('click', () => {
        this.host.openOnlineLobbyModal(true);
      });
      bar.querySelector('#btn-isl-clear')?.addEventListener('click', () => {
        this.host.executeDebugStoryJump('clear_current_island');
      });
      bar.querySelector('#btn-isl-exit')?.addEventListener('click', () => {
        exitIslandToSea(this.host.campaign);
        void this.host.triggerAutoSave('항구 출항');
        this.host.switchToScene('SEA_SAILING');
      });
    } else if (this.host.activeScene === 'ONLINE_BATTLE') {
      if (this.host.onlineAssignedRole === 'SPECTATOR') {
        bar.innerHTML = `
          <button data-spec-cam="ALL" class="btn-tab-active">🎥 전체 아레나 카메라</button>
          <button data-spec-cam="0" class="btn-showcase">🎥 P1 추적</button>
          <button data-spec-cam="1" class="btn-showcase">🎥 P2 추적</button>
          <button data-spec-cam="2" class="btn-showcase">🎥 P3 추적</button>
          <button data-spec-cam="3" class="btn-showcase">🎥 P4 추적</button>
          <button id="btn-spec-leave" class="btn-danger">관전 종료 및 로비 복귀</button>
        `;
        bar.querySelectorAll<HTMLButtonElement>('[data-spec-cam]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const v = btn.dataset.specCam;
            this.host.spectatorCameraTarget =
              v === 'ALL' ? 'ALL' : (Number(v) as 0 | 1 | 2 | 3);
          });
        });
        bar.querySelector('#btn-spec-leave')?.addEventListener('click', () => {
          this.host.finishOnlineMatch('DRAW', '관전을 종료하고 로비로 복귀했습니다.');
        });
      } else {
        bar.innerHTML = `
          <button id="btn-online-forfeit" class="btn-danger">
            ${
              this.host.forfeitConfirmArmed
                ? '⚠ 다시 클릭 시 배틀 포기 확정 (패배 처리)'
                : '🏳 배틀 포기 (2회 확인)'
            }
          </button>
        `;
        bar.querySelector('#btn-online-forfeit')?.addEventListener('click', () => {
          if (!this.host.forfeitConfirmArmed) {
            this.host.forfeitConfirmArmed = true;
            this.updateShowcaseToolbar();
            return;
          }
          if (this.host.activeLockstep && this.host.activeTransport) {
            this.host.activeTransport.send({
              type: 'FORFEIT_MATCH',
              roomCode: this.host.activeLockstep.config.roomCode
            });
          }
        });
      }
    } else if (this.host.activeScene === 'STORY_BATTLE') {
      const isThreeOn = this.host.threeMusouController?.isEnabled() ?? true;
      bar.innerHTML = `
        <button id="btn-btl-win" class="btn-tab-active">⚡ 스토리 전투 즉시 승리 (보상 & 에피소드 완료)</button>
        <button id="btn-btl-form" class="btn-showcase">☁ 기어5 / 각성 발동 [Shift+F]</button>
        <button id="btn-toggle-3d-musou" class="btn-showcase">${isThreeOn ? '🎮 3D 무쌍 / 2D 전환' : '🖼 2D 픽시 / 3D 무쌍'}</button>
        <button id="btn-musou-burst-demo" class="btn-showcase">💥 무쌍 난무·파괴 데모</button>
        <button id="btn-btl-retreat" class="btn-showcase">⚓ 정박 항구로 후퇴</button>
      `;
      bar.querySelector('#btn-btl-win')?.addEventListener('click', () => {
        this.host.finishStoryBattle(true);
      });
      bar.querySelector('#btn-btl-form')?.addEventListener('click', () => {
        const playerUnit = this.host.battleWorld.units.find(
          (u) => u.team === 'ALPHA' && u.isOnField
        );
        if (playerUnit) {
          activateFormShift(playerUnit, this.host.battleWorld, this.host.gameRegistry);
        }
      });
      bar.querySelector('#btn-toggle-3d-musou')?.addEventListener('click', () => {
        this.host.threeMusouController?.toggleEnabled(this.host);
      });
      bar.querySelector('#btn-musou-burst-demo')?.addEventListener('click', () => {
        this.host.threeMusouController?.triggerMusouDemoBurst(this.host);
      });
      bar.querySelector('#btn-btl-retreat')?.addEventListener('click', () => {
        this.host.finishStoryBattle(false);
      });
    } else {
      const isThreeOn = this.host.threeMusouController?.isEnabled() ?? true;
      bar.innerHTML = `
        <button id="btn-toggle-3d-musou" class="btn-showcase">${isThreeOn ? '🎮 3D 무쌍 / 2D 전환' : '🖼 2D 픽시 / 3D 무쌍'}</button>
        <button id="btn-musou-burst-demo" class="btn-showcase">💥 무쌍 난무·파괴 데모</button>
        <button id="btn-demo-beam" class="btn-showcase">⚡ 보로 브레스 vs 레이저 빔 맞대결</button>
        <button id="btn-demo-melee" class="btn-showcase">👑 루피 vs 카이도 패왕색 하늘 가르기</button>
        <button id="btn-demo-form" class="btn-showcase">☁ 기어5(흰 구름띠) & 루치(검은 구름띠) 각성</button>
        <button id="btn-demo-zoan" class="btn-showcase">🔄 동물계 변신 순환 (인간↔인수↔청룡)</button>
        <button id="btn-demo-status" class="btn-showcase">✨ 자연계(키자루) 비패기 흘려보내기</button>
      `;
      bar.querySelector('#btn-toggle-3d-musou')?.addEventListener('click', () => {
        this.host.threeMusouController?.toggleEnabled(this.host);
      });
      bar.querySelector('#btn-musou-burst-demo')?.addEventListener('click', () => {
        this.host.threeMusouController?.triggerMusouDemoBurst(this.host);
      });
      bar.querySelector('#btn-demo-beam')?.addEventListener('click', () => {
        this.host.triggerSandboxShowcase('BEAM_CLASH');
      });
      bar.querySelector('#btn-demo-melee')?.addEventListener('click', () => {
        this.host.triggerSandboxShowcase('CONQUEROR_CLASH');
      });
      bar.querySelector('#btn-demo-form')?.addEventListener('click', () => {
        this.host.triggerSandboxShowcase('HAGOROMO_AWAKENING');
      });
      bar.querySelector('#btn-demo-zoan')?.addEventListener('click', () => {
        this.host.triggerSandboxShowcase('ZOAN_CYCLE');
      });
      bar.querySelector('#btn-demo-status')?.addEventListener('click', () => {
        this.host.triggerSandboxShowcase('LOGIA_PASS');
      });
    }
  }
}
