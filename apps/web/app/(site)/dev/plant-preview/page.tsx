import { notFound } from "next/navigation";
import { PlantPreview } from "./_components/plant-preview";

/**
 * 포트폴리오 식물 3D 시안 (dev 전용). 운영 빌드에서는 404 — 측정용 프로덕션 빌드만
 * `PLANT_PREVIEW=1 next start` 로 연다.
 */
export const dynamic = "force-dynamic";

export default function PlantPreviewPage() {
  if (process.env.NODE_ENV === "production" && process.env.PLANT_PREVIEW !== "1") notFound();
  return <PlantPreview />;
}
