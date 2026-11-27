import * as THREE from "three";
import { REBALANCE_BADGE_COLOR, REBALANCE_BADGE_HIT_PX, REBALANCE_BADGE_PX } from "./plant-options";

/** `userData` 표시. 렌더러가 탭한 것이 배지인지 볼 때 쓴다. */
export const REBALANCE_BADGE_KEY = "rebalanceBadge";

/** 산호색 원 + 흰 `!` (128×128, 투명 배경). */
function drawBadge(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "rgba(0,0,0,0.14)";
  ctx.beginPath();
  ctx.arc(64, 68, 52, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = REBALANCE_BADGE_COLOR;
  ctx.beginPath();
  ctx.arc(64, 62, 52, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "900 78px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("!", 64, 66);
}

/**
 * 리밸런싱 `!` 배지. 화면에서 늘 같은 픽셀 크기로 보이게(`sizeAttenuation: false`) 해 정원 전체에서도
 * 어느 식물인지 바로 보인다. 보이는 배지보다 큰 투명 스프라이트를 겹쳐 누르는 영역을 44px 이상으로 둔다.
 * `y` 는 식물 꼭대기 옆 높이 (식물 root 좌표).
 */
export function createRebalanceBadge(y: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) drawBadge(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // 배지는 늘 식물 위에 보이도록 깊이 검사를 끈다.
  const material = new THREE.SpriteMaterial({
    map: texture,
    depthTest: false,
    sizeAttenuation: false,
  });
  const hitMaterial = new THREE.SpriteMaterial({
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    sizeAttenuation: false,
  });
  const sprite = new THREE.Sprite(material);
  const hit = new THREE.Sprite(hitMaterial);
  sprite.renderOrder = 10;
  sprite.userData[REBALANCE_BADGE_KEY] = true;
  hit.userData[REBALANCE_BADGE_KEY] = true;
  const group = new THREE.Group();
  group.position.set(0.5, y, 0);
  group.add(sprite, hit);

  return {
    object: group,
    /** `pxToScale`: 화면 1 CSS px 에 해당하는 스프라이트 크기. */
    update(time: number, pxToScale: number) {
      group.position.y = y + Math.sin(time * 2.4) * 0.05;
      const pulse = 1 + Math.max(0, Math.sin(time * 3)) * 0.08;
      sprite.scale.setScalar(REBALANCE_BADGE_PX * pxToScale * pulse);
      hit.scale.setScalar(Math.max(REBALANCE_BADGE_HIT_PX, REBALANCE_BADGE_PX) * pxToScale);
    },
    dispose() {
      texture.dispose();
      material.dispose();
      hitMaterial.dispose();
    },
  };
}
