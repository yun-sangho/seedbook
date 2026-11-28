"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GardenCanvas } from "@web/features/garden/components/garden-canvas";
import { PlantAvatar } from "@web/features/garden/components/plant-avatar";
import { gardenLayout } from "@web/features/garden/plant-3d/garden-layout";
import {
  DEFAULT_PLANT_OPTIONS,
  FERN_STAGE_LABELS,
  PLANT_STAGE_LABELS,
  PLANT_STAGES,
  type PlantKind,
  type PlantOptions,
  type PlantStage,
} from "@web/features/garden/plant-3d/plant-options";
import type { PlantSlot } from "@web/features/garden/plant-3d/plant-renderer";
import { DroopSlider, MetricsBadge, ON_OFF, Segmented, useMetrics } from "./plant-preview";

/**
 * 보스턴고사리 시안: 지금 식물(나무)과 단계별로 나란히, 정원에 섞은 모습, 2D 아바타, 무게 비교.
 */

const STAGE_SPACING = 2.2;

function StageRow({
  kind,
  droop,
  rebalance,
}: {
  kind: PlantKind;
  droop: number;
  rebalance: boolean;
}) {
  const { metrics, onMetrics } = useMetrics();
  const slots = useMemo<PlantSlot[]>(
    () =>
      PLANT_STAGES.map((stage, i) => ({
        options: {
          ...DEFAULT_PLANT_OPTIONS,
          kind,
          stage,
          droop,
          needsRebalance: rebalance,
          seed: 11 + i,
        },
        x: (i - 2) * STAGE_SPACING,
        z: 0,
      })),
    [kind, droop, rebalance]
  );
  return (
    <div className="relative h-[210px] overflow-hidden rounded-3xl bg-gradient-to-b from-[#FFF8EC] to-[#E8F3DF]">
      <GardenCanvas
        slots={slots}
        layoutWidth={STAGE_SPACING * 4}
        garden
        onMetrics={onMetrics}
        className="h-full w-full"
      />
      <MetricsBadge metrics={metrics} />
      <span className="absolute top-2 right-3 rounded-full bg-white/80 px-2 py-0.5 text-xs font-bold">
        {kind === "fern" ? "고사리" : "지금 식물"}
      </span>
    </div>
  );
}

function StageCompare() {
  const [droop, setDroop] = useState(0);
  const [rebalance, setRebalance] = useState(false);
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-bold">단계별 비교</h2>
      <p className="text-[12px] text-neutral-500">
        고사리: 씨앗(연두) → 새순 → 어린 잎 → 고사리 → 풍성 (잎 끝 이슬·반짝임)
      </p>
      <StageRow kind="tree" droop={droop} rebalance={rebalance} />
      <StageRow kind="fern" droop={droop} rebalance={rebalance} />
      <DroopSlider value={droop} onChange={setDroop} />
      <Segmented
        label="리밸런싱"
        value={rebalance ? "on" : "off"}
        options={["off", "on"] as const}
        labels={ON_OFF}
        onChange={(v) => setRebalance(v === "on")}
      />
    </section>
  );
}

/** 정원 데모: 나무·고사리 섞기. */
const MIXED_PLANTS: { name: string; options: Omit<PlantOptions, "seed"> }[] = [
  {
    name: "A",
    options: { kind: "fern", stage: "bloom", droop: 0, needsRebalance: false, pot: "cream" },
  },
  {
    name: "B",
    options: { kind: "tree", stage: "bloom", droop: 0, needsRebalance: true, pot: "lavender" },
  },
  {
    name: "C",
    options: { kind: "fern", stage: "sapling", droop: 0.4, needsRebalance: true, pot: "sky" },
  },
  {
    name: "D",
    options: { kind: "tree", stage: "tree", droop: 0, needsRebalance: false, pot: "terracotta" },
  },
  {
    name: "E",
    options: { kind: "fern", stage: "tree", droop: 0, needsRebalance: false, pot: "sun" },
  },
  {
    name: "F",
    options: { kind: "fern", stage: "sprout", droop: 0, needsRebalance: false, pot: "terracotta" },
  },
  {
    name: "G",
    options: { kind: "tree", stage: "sapling", droop: 0.7, needsRebalance: false, pot: "sky" },
  },
  {
    name: "H",
    options: {
      kind: "fern",
      stage: "bloom",
      droop: 0,
      needsRebalance: false,
      pot: "lavender",
    },
  },
];

function MixedGarden() {
  const [count, setCount] = useState<"3" | "5" | "8">("5");
  const [focus, setFocus] = useState<number | null>(null);
  const { metrics, onMetrics } = useMetrics();
  const layout = useMemo(() => gardenLayout(Number(count)), [count]);
  const plants = MIXED_PLANTS.slice(0, layout.spots.length);
  const slots = useMemo<PlantSlot[]>(
    () =>
      layout.spots.map((spot, i) => ({
        options: { ...(MIXED_PLANTS[i]?.options ?? DEFAULT_PLANT_OPTIONS), seed: 5 + i * 13 },
        x: spot.x,
        z: spot.z,
      })),
    [layout]
  );
  const onPick = useCallback((index: number | null) => setFocus(index), []);
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-bold">정원에 섞기</h2>
      <div className="relative h-[320px] overflow-hidden rounded-3xl bg-gradient-to-b from-[#EAF4FB] via-[#FFF8EC] to-[#E3F0D6]">
        <GardenCanvas
          slots={slots}
          layoutWidth={layout.width}
          garden
          focus={focus}
          onPick={onPick}
          onMetrics={onMetrics}
          className="h-full w-full"
        />
        <MetricsBadge metrics={metrics} />
      </div>
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => setFocus(null)}
          className={`rounded-full px-3 py-1.5 text-[13px] font-medium ${focus === null ? "bg-neutral-900 text-white" : "bg-black/5"}`}
        >
          전체
        </button>
        {plants.map((plant, i) => (
          <button
            key={plant.name}
            type="button"
            onClick={() => setFocus(i)}
            className={`flex items-center gap-1 rounded-full py-1 pr-3 pl-1 text-[13px] font-medium ${focus === i ? "bg-neutral-900 text-white" : "bg-black/5"}`}
          >
            <PlantAvatar
              stage={plant.options.stage}
              pot={plant.options.pot}
              kind={plant.options.kind}
              size={22}
            />
            {plant.name}
          </button>
        ))}
      </div>
      <Segmented
        label="식물 수"
        value={count}
        options={["3", "5", "8"] as const}
        labels={{ "3": "3개", "5": "5개", "8": "8개" }}
        onChange={(v) => {
          setFocus(null);
          setCount(v);
        }}
      />
    </section>
  );
}

const AVATAR_SIZES = [72, 48, 32] as const;

function AvatarCompare() {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-bold">2D 아바타 (72·48·32px)</h2>
      {PLANT_STAGES.map((stage) => (
        <div key={stage} className="flex items-end gap-2 rounded-2xl bg-black/[0.03] p-2">
          <div className="flex items-end gap-1.5">
            {AVATAR_SIZES.map((size) => (
              <PlantAvatar key={size} stage={stage} size={size} />
            ))}
          </div>
          <div className="mx-1 h-16 w-px self-center bg-black/10" />
          <div className="flex items-end gap-1.5">
            {AVATAR_SIZES.map((size) => (
              <PlantAvatar key={size} stage={stage} size={size} kind="fern" pot="cream" />
            ))}
          </div>
          <span className="ml-auto w-12 text-right text-[11px] leading-4 font-semibold text-neutral-500">
            {PLANT_STAGE_LABELS[stage]}
            <br />
            {FERN_STAGE_LABELS[stage]}
          </span>
        </div>
      ))}
    </section>
  );
}

interface Weight {
  meshes: number;
  triangles: number;
}

/** 식물 하나를 만들어 메시 수(≈ draw call)와 삼각형 수를 센다 (화분·그림자·배지 포함). */
function useWeights() {
  const [rows, setRows] = useState<{ stage: PlantStage; tree: Weight; fern: Weight }[] | null>(
    null
  );
  useEffect(() => {
    let cancelled = false;
    Promise.all([import("three"), import("@web/features/garden/plant-3d/build-plant")]).then(
      ([THREE, { buildPlant }]) => {
        const measure = (options: Partial<PlantOptions>): Weight => {
          const built = buildPlant({ ...DEFAULT_PLANT_OPTIONS, ...options });
          let meshes = 0;
          let triangles = 0;
          built.root.traverse((node) => {
            if (!(node instanceof THREE.Mesh)) return;
            meshes++;
            const geometry = node.geometry as InstanceType<typeof THREE.BufferGeometry>;
            const count = geometry.index?.count ?? geometry.getAttribute("position").count;
            triangles += count / 3;
          });
          built.dispose();
          return { meshes, triangles: Math.round(triangles) };
        };
        const next = PLANT_STAGES.map((stage) => ({
          stage,
          tree: measure({ stage }),
          fern: measure({ stage, kind: "fern" }),
        }));
        if (!cancelled) setRows(next);
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return rows;
}

function WeightTable() {
  const rows = useWeights();
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-bold">무게 (식물 하나, 화분 포함)</h2>
      <p className="text-[12px] text-neutral-500">
        메시 수 ≈ draw call. 고사리는 잎줄기마다 엽축·소엽을 정점 색 지오메트리 하나로 합쳐 잎줄기
        하나가 draw call 하나다 (수백 장의 소엽을 따로 그리지 않는다).
      </p>
      <table className="w-full text-left text-[12px]">
        <thead className="text-neutral-500">
          <tr>
            <th className="py-1">단계</th>
            <th>지금 식물</th>
            <th>고사리</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {(rows ?? []).map((row) => (
            <tr key={row.stage} className="border-t border-black/5">
              <td className="py-1 font-sans">{FERN_STAGE_LABELS[row.stage]}</td>
              {[row.tree, row.fern].map((w, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 열 순서가 고정된 표
                <td key={i}>
                  {w.meshes} · {w.triangles.toLocaleString()}△
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows && <p className="text-[12px] text-neutral-400">재는 중…</p>}
    </section>
  );
}

export function FernCompare() {
  return (
    <div className="flex flex-col gap-8">
      <StageCompare />
      <MixedGarden />
      <AvatarCompare />
      <WeightTable />
    </div>
  );
}
