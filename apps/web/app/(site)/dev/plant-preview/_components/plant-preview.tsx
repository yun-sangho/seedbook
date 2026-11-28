"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PlantAvatar } from "@mobile/features/garden/components/plant-avatar";
import { gardenLayout } from "@mobile/features/garden/plant-3d/garden-layout";
import {
  DEFAULT_PLANT_OPTIONS,
  FERN_STAGE_LABELS,
  PLANT_KIND_LABELS,
  PLANT_KINDS,
  PLANT_STAGE_LABELS,
  PLANT_STAGES,
  type PlantKind,
  type PlantOptions,
  POT_COLOR_IDS,
  POT_COLORS,
  type PotColor,
} from "@mobile/features/garden/plant-3d/plant-options";
import type { PlantSceneMetrics, PlantSlot } from "@mobile/features/garden/plant-3d/plant-renderer";
import { plantWilt, plantWind } from "@mobile/features/garden/utils/garden-home";
import { GardenCanvas } from "@web/app/(site)/_components/garden-canvas";
import { FernCompare } from "./fern-compare";

/**
 * 식물 렌더링 컴포넌트 미리보기 (dev 전용). 데이터 없이 props 만 바꿔 본다.
 * 측정값은 화면 왼쪽 위와 `window.__plantMetrics` 로 읽는다.
 */

type Tab = "plant" | "stages" | "garden" | "avatar" | "fern";
const TABS: { id: Tab; label: string }[] = [
  { id: "plant", label: "식물 하나" },
  { id: "stages", label: "5단계" },
  { id: "garden", label: "정원" },
  { id: "avatar", label: "2D 아바타" },
  { id: "fern", label: "고사리 시안" },
];

export function useMetrics() {
  const [metrics, setMetrics] = useState<PlantSceneMetrics | null>(null);
  const onMetrics = useCallback((next: PlantSceneMetrics) => {
    setMetrics(next);
    (window as unknown as { __plantMetrics?: PlantSceneMetrics }).__plantMetrics = next;
  }, []);
  return { metrics, onMetrics };
}

export function MetricsBadge({ metrics }: { metrics: PlantSceneMetrics | null }) {
  if (!metrics) return null;
  return (
    <div className="pointer-events-none absolute top-2 left-2 rounded-lg bg-black/55 px-2 py-1 font-mono text-[10px] leading-4 text-white">
      <div>
        {metrics.fps} fps · 최장 {metrics.worstFrameMs}ms
      </div>
      <div>첫 프레임 {metrics.firstFrameMs?.toFixed(0)}ms</div>
      <div>
        draw {metrics.drawCalls} · tri {metrics.triangles.toLocaleString()}
      </div>
      {metrics.transition && (
        <div>
          전환 {metrics.transition.fps} fps · 최장 {metrics.transition.worstFrameMs}ms
        </div>
      )}
    </div>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-neutral-500">{label}</span>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`rounded-full px-3 py-1.5 text-[13px] font-medium ${
              option === value ? "bg-[#2F8A40] text-white" : "bg-black/5 text-neutral-700"
            }`}
          >
            {labels[option]}
          </button>
        ))}
      </div>
    </div>
  );
}

export const ON_OFF = { off: "아니요", on: "필요" } as const;

/** 식물 상태 조절 값: 데이터 쪽 입력(하락률·이탈 기간)을 넣으면 매핑 함수로 3D 옵션을 만든다. */
export interface PlantCondition {
  /** 마지막으로 달성한 목표 대비 하락 (%). */
  dropPercent: number;
  /** 비중 이탈 기간 (일). 0 이면 이탈 아님. */
  driftDays: number;
  ripe: number;
}

export const CALM_CONDITION: PlantCondition = { dropPercent: 0, driftDays: 0, ripe: 0 };

export function conditionOptions(
  condition: PlantCondition
): Pick<PlantOptions, "wind" | "wilt" | "ripe"> {
  return {
    wind: plantWind(1 - condition.dropPercent / 100, 1, true),
    wilt: plantWilt(condition.driftDays > 0 ? condition.driftDays : null),
    ripe: condition.ripe,
  };
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  accent,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  accent: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-neutral-500">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ accentColor: accent }}
      />
    </label>
  );
}

/** 바람(시장 하락)·시듦(비중 이탈 기간)·익음 조절. 리밸런싱 기울기는 따로 고른다. */
export function ConditionControls({
  value,
  onChange,
}: {
  value: PlantCondition;
  onChange: (value: PlantCondition) => void;
}) {
  const { wind, wilt, ripe } = conditionOptions(value);
  const set = <K extends keyof PlantCondition>(key: K, next: PlantCondition[K]) =>
    onChange({ ...value, [key]: next });
  return (
    <div className="flex flex-col gap-3">
      <Slider
        label={`바람 · 마지막 목표 대비 하락 ${value.dropPercent}% → wind ${wind.toFixed(2)}`}
        value={value.dropPercent}
        min={0}
        max={30}
        step={1}
        accent="#4F7BA8"
        onChange={(v) => set("dropPercent", v)}
      />
      <Slider
        label={`시듦 · 비중 이탈 ${value.driftDays}일 → wilt ${wilt.toFixed(2)}`}
        value={value.driftDays}
        min={0}
        max={40}
        step={1}
        accent="#B08A2E"
        onChange={(v) => set("driftDays", v)}
      />
      <div className="flex flex-wrap gap-1">
        {[0, 7, 14, 28].map((days) => (
          <button
            key={days}
            type="button"
            onClick={() => set("driftDays", days)}
            className={`rounded-full px-2.5 py-1 text-[12px] font-medium ${
              value.driftDays === days ? "bg-[#B08A2E] text-white" : "bg-black/5 text-neutral-700"
            }`}
          >
            {days === 0 ? "이탈 없음" : `${days}일`}
          </button>
        ))}
      </div>
      <Slider
        label={`익음 (꽃·열매 단계) · ripe ${ripe.toFixed(2)}`}
        value={value.ripe}
        min={0}
        max={1}
        step={0.05}
        accent="#D9532F"
        onChange={(v) => set("ripe", v)}
      />
    </div>
  );
}

export function PotPicker({
  value,
  onChange,
}: {
  value: PotColor;
  onChange: (pot: PotColor) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-neutral-500">화분 색</span>
      <div className="flex gap-2">
        {POT_COLOR_IDS.map((pot) => (
          <button
            key={pot}
            type="button"
            aria-label={pot}
            onClick={() => onChange(pot)}
            className={`h-7 w-7 rounded-full border-2 ${pot === value ? "border-neutral-800" : "border-transparent"}`}
            style={{ background: POT_COLORS[pot].body }}
          />
        ))}
      </div>
    </div>
  );
}

function SinglePlant() {
  const [options, setOptions] = useState<PlantOptions>(DEFAULT_PLANT_OPTIONS);
  const [condition, setCondition] = useState<PlantCondition>(CALM_CONDITION);
  const { metrics, onMetrics } = useMetrics();
  const slots = useMemo<PlantSlot[]>(
    () => [{ options: { ...options, ...conditionOptions(condition) }, x: 0, z: 0 }],
    [options, condition]
  );
  const set = <K extends keyof PlantOptions>(key: K, value: PlantOptions[K]) =>
    setOptions((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="flex flex-col gap-4">
      <div className="relative h-[380px] overflow-hidden rounded-3xl bg-gradient-to-b from-[#FFF8EC] to-[#E8F3DF]">
        <GardenCanvas
          slots={slots}
          layoutWidth={0}
          garden={false}
          onMetrics={onMetrics}
          className="h-full w-full"
        />
        <MetricsBadge metrics={metrics} />
      </div>
      <Segmented
        label="종류"
        value={options.kind ?? "tree"}
        options={PLANT_KINDS}
        labels={PLANT_KIND_LABELS}
        onChange={(v) => set("kind", v)}
      />
      <Segmented
        label="성장 단계"
        value={options.stage}
        options={PLANT_STAGES}
        labels={options.kind === "fern" ? FERN_STAGE_LABELS : PLANT_STAGE_LABELS}
        onChange={(v) => set("stage", v)}
      />
      <ConditionControls value={condition} onChange={setCondition} />
      <Segmented
        label="리밸런싱"
        value={options.needsRebalance ? "on" : "off"}
        options={["off", "on"] as const}
        labels={ON_OFF}
        onChange={(v) => set("needsRebalance", v === "on")}
      />
      <PotPicker value={options.pot} onChange={(v) => set("pot", v)} />
    </div>
  );
}

function Stages() {
  const [kind, setKind] = useState<PlantKind>("tree");
  const [condition, setCondition] = useState<PlantCondition>(CALM_CONDITION);
  const [rebalance, setRebalance] = useState(false);
  const { metrics, onMetrics } = useMetrics();
  const slots = useMemo<PlantSlot[]>(
    () =>
      PLANT_STAGES.map((stage, i) => ({
        options: {
          ...DEFAULT_PLANT_OPTIONS,
          ...conditionOptions(condition),
          kind,
          stage,
          needsRebalance: rebalance,
          seed: 11 + i,
        },
        x: (i - 2) * (kind === "fern" ? 2.2 : 1.6),
        z: 0,
      })),
    [kind, condition, rebalance]
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="relative h-[300px] overflow-hidden rounded-3xl bg-gradient-to-b from-[#FFF8EC] to-[#E8F3DF]">
        <GardenCanvas
          slots={slots}
          layoutWidth={kind === "fern" ? 8.8 : 6.4}
          garden
          onMetrics={onMetrics}
          className="h-full w-full"
        />
        <MetricsBadge metrics={metrics} />
      </div>
      <Segmented
        label="종류"
        value={kind}
        options={PLANT_KINDS}
        labels={PLANT_KIND_LABELS}
        onChange={setKind}
      />
      <ConditionControls value={condition} onChange={setCondition} />
      <Segmented
        label="리밸런싱"
        value={rebalance ? "on" : "off"}
        options={["off", "on"] as const}
        labels={ON_OFF}
        onChange={(v) => setRebalance(v === "on")}
      />
    </div>
  );
}

/** 정원 데모용 식물 (데이터 연결 없음). */
const DEMO_PLANTS: { name: string; options: Omit<PlantOptions, "seed"> }[] = [
  {
    name: "A",
    options: { stage: "tree", wind: 0, wilt: 0, ripe: 0, needsRebalance: false, pot: "terracotta" },
  },
  {
    name: "B",
    options: {
      stage: "sapling",
      wind: 0.25,
      wilt: 0.35,
      ripe: 0,
      needsRebalance: true,
      pot: "sky",
    },
  },
  {
    name: "C",
    options: { stage: "sprout", wind: 0, wilt: 0, ripe: 0, needsRebalance: false, pot: "sun" },
  },
  {
    name: "D",
    options: { stage: "bloom", wind: 0, wilt: 0, ripe: 1, needsRebalance: true, pot: "lavender" },
  },
  {
    name: "E",
    options: { stage: "seed", wind: 0, wilt: 0, ripe: 0, needsRebalance: false, pot: "cream" },
  },
  {
    name: "F",
    options: { stage: "tree", wind: 0.5, wilt: 0, ripe: 0, needsRebalance: false, pot: "cream" },
  },
  {
    name: "G",
    options: {
      stage: "sapling",
      wind: 0,
      wilt: 1,
      ripe: 0,
      needsRebalance: true,
      pot: "terracotta",
    },
  },
  {
    name: "H",
    options: { stage: "sprout", wind: 0, wilt: 0, ripe: 0, needsRebalance: false, pot: "sky" },
  },
];

function Garden() {
  const [count, setCount] = useState<"1" | "3" | "8">("3");
  const [focus, setFocus] = useState<number | null>(null);
  const [lastPick, setLastPick] = useState("");
  const { metrics, onMetrics } = useMetrics();
  const layout = useMemo(() => gardenLayout(Number(count)), [count]);
  const plants = DEMO_PLANTS.slice(0, layout.spots.length);
  const slots = useMemo<PlantSlot[]>(
    () =>
      layout.spots.map((spot, i) => ({
        options: { ...(DEMO_PLANTS[i]?.options ?? DEFAULT_PLANT_OPTIONS), seed: 5 + i * 13 },
        x: spot.x,
        z: spot.z,
      })),
    [layout]
  );
  const onPick = useCallback((index: number | null, target: { badge: boolean }) => {
    const name = index === null ? "빈 곳" : (DEMO_PLANTS[index]?.name ?? "");
    setLastPick(target.badge ? `${name} 의 ! 배지` : name);
    setFocus(index);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative h-[340px] overflow-hidden rounded-3xl bg-gradient-to-b from-[#EAF4FB] via-[#FFF8EC] to-[#E3F0D6]">
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
      <p className="text-[13px] text-neutral-600">마지막 탭: {lastPick || "—"}</p>
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
            <PlantAvatar stage={plant.options.stage} pot={plant.options.pot} size={22} />
            {plant.name}
          </button>
        ))}
      </div>
      <Segmented
        label="식물 수"
        value={count}
        options={["1", "3", "8"] as const}
        labels={{ "1": "1개", "3": "3개", "8": "8개" }}
        onChange={(v) => {
          setFocus(null);
          setCount(v);
        }}
      />
    </div>
  );
}

const AVATAR_SIZES = [72, 48, 32] as const;

function Avatars() {
  const [pot, setPot] = useState<PotColor>("terracotta");
  return (
    <div className="flex flex-col gap-3">
      <PotPicker value={pot} onChange={setPot} />
      {PLANT_STAGES.map((stage) => (
        <div key={stage} className="flex items-end gap-3 rounded-2xl bg-black/[0.03] p-3">
          <span className="w-14 text-xs font-semibold text-neutral-500">
            {PLANT_STAGE_LABELS[stage]}
          </span>
          {AVATAR_SIZES.map((size) => (
            <PlantAvatar key={size} stage={stage} pot={pot} size={size} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function PlantPreview() {
  const [tab, setTab] = useState<Tab>("plant");
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("tab");
    if (TABS.some((t) => t.id === initial)) setTab(initial as Tab);
  }, []);

  return (
    <div className="mx-auto flex min-h-full max-w-[440px] flex-col gap-4 bg-[#FFFDF8] px-4 pt-4 pb-10 text-neutral-900">
      <header>
        <p className="text-[11px] font-semibold text-[#2F8A40]">DEV</p>
        <h1 className="text-xl font-bold">포트폴리오 식물</h1>
      </header>
      <nav className="flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${
              tab === t.id ? "bg-neutral-900 text-white" : "bg-black/5 text-neutral-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === "plant" && <SinglePlant />}
      {tab === "stages" && <Stages />}
      {tab === "garden" && <Garden />}
      {tab === "avatar" && <Avatars />}
      {tab === "fern" && <FernCompare />}
    </div>
  );
}
