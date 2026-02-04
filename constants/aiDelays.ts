// UX 목적의 AI 지연 시간 상수 (사용자 경험을 위해 유지)
export const AI_UX_DELAYS = {
    /** AI가 주사위를 굴리기 전 "생각하는" 시간 */
    BEFORE_ROLL_DICE: 1500,
    /** AI가 모달(구매/인수 등) 결정을 내리기 전 시간 */
    BEFORE_MODAL_DECISION: 2000,
    /** AI가 텔레포트 목적지를 선택하기 전 시간 */
    BEFORE_TELEPORT: 2500,
    /** AI가 턴을 종료하기 전 시간 */
    BEFORE_NEXT_TURN: 1500,
    /** AI가 빚 청산을 위해 땅을 팔기 전 시간 */
    BEFORE_SELL_LAND: 1500
} as const;

// 애니메이션 관련 상수
export const ANIMATION_DELAYS = {
    /** 한 칸 이동 애니메이션 시간 */
    MOVE_STEP: 300,
    /** 주사위 애니메이션 시간 */
    DICE_ROLL: 1000
} as const;
