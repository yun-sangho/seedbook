import type { RecordDefinition, RecordValues } from "./define-record";
import type { FieldSpec, JsonShape, JsonValue } from "./fields";
import { isShape } from "./parse-patch";

export const SAMPLE_UUID = "7d3f9a52-1c4b-4e8a-9f60-2b7c5d8e1a34";

/**
 * 정의를 통과하는 결정적인 표본 값 (테스트용). null 을 받는 필드도 값을 채운다 —
 * 값이 있을 때의 모양까지 대조하기 위해서다.
 */
export function sampleRecord<D extends RecordDefinition>(definition: D): RecordValues<D> {
  const values: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(definition.fields)) {
    values[name] = sampleValue(field.spec, name);
  }
  return values as RecordValues<D>;
}

const inRange = (spec: FieldSpec, value: number) =>
  Math.min(spec.max ?? value, Math.max(spec.min ?? value, value));

export function sampleValue(spec: FieldSpec, name: string): JsonValue {
  switch (spec.kind) {
    case "text":
      return `sample-${name}`;
    case "enum": {
      const first = spec.values?.[0] ?? "";
      return spec.list ? [first] : first;
    }
    case "int":
      return inRange(spec, 1);
    case "decimal":
      return inRange(spec, 1.5);
    case "money":
      return inRange(spec, 12000);
    case "date":
      return "2026-11-28";
    case "timestamp":
      return "2026-11-28T01:02:03.000Z";
    case "uuidRef":
      return SAMPLE_UUID;
    case "bool":
      return true;
    case "json":
      return spec.shape ? sampleShape(spec.shape, name) : null;
  }
}

function sampleShape(shape: JsonShape, name: string): JsonValue {
  if (shape.kind === "list") {
    return [isShape(shape.item) ? sampleShape(shape.item, name) : sampleValue(shape.item, name)];
  }
  const value: Record<string, JsonValue> = {};
  for (const [field, spec] of Object.entries(shape.fields)) value[field] = sampleValue(spec, field);
  return value;
}
