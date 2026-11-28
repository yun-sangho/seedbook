import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createRain, RAIN_KEY, rainLook } from "./rain";

const lambert = (color: THREE.ColorRepresentation) => new THREE.MeshLambertMaterial({ color });

function dropsOf(object: THREE.Object3D): THREE.InstancedMesh {
  let found: THREE.InstancedMesh | null = null;
  object.traverse((node) => {
    if (node instanceof THREE.InstancedMesh) found = node;
  });
  if (!found) throw new Error("no drops");
  return found;
}

describe("rainLook", () => {
  it("is dry without a drop", () => {
    expect(rainLook(0)).toBeNull();
    expect(rainLook(-1)).toBeNull();
  });

  it("starts as a light drizzle", () => {
    const light = rainLook(0.01);
    expect(light?.drops).toBeGreaterThanOrEqual(4);
  });

  it("pours more, thicker and faster drops as the drop deepens", () => {
    const light = rainLook(0.2);
    const heavy = rainLook(1);
    if (!light || !heavy) throw new Error("expected rain");
    expect(heavy.drops).toBeGreaterThan(light.drops);
    expect(heavy.radius).toBeGreaterThan(light.radius);
    expect(heavy.length).toBeGreaterThan(light.length);
    expect(heavy.fallSeconds).toBeLessThan(light.fallSeconds);
  });

  it("darkens the cloud in a heavy rain", () => {
    const light = new THREE.Color(rainLook(0.2)?.cloudColor);
    const heavy = new THREE.Color(rainLook(1)?.cloudColor);
    expect(heavy.getHSL({ h: 0, s: 0, l: 0 }).l).toBeLessThan(light.getHSL({ h: 0, s: 0, l: 0 }).l);
  });

  it("caps at full rain", () => {
    expect(rainLook(3)).toEqual(rainLook(1));
  });
});

describe("createRain", () => {
  it("does not rain without a drop", () => {
    expect(createRain(0, 2, 1, lambert)).toBeNull();
  });

  it("draws every drop with one geometry and one material", () => {
    const rain = createRain(1, 2, 1, lambert);
    if (!rain) throw new Error("expected rain");
    const drops = dropsOf(rain.object);
    expect(drops.count).toBe(rainLook(1)?.drops);
    expect(rain.object.userData[RAIN_KEY]).toBe(true);
  });

  it("lets the drops fall over time without allocating new objects", () => {
    const rain = createRain(0.5, 2, 1, lambert);
    if (!rain) throw new Error("expected rain");
    const drops = dropsOf(rain.object);
    const y = (time: number) => {
      rain.update(time);
      const m = new THREE.Matrix4();
      drops.getMatrixAt(0, m);
      return new THREE.Vector3().setFromMatrixPosition(m).y;
    };
    const before = drops.instanceMatrix.array;
    expect(y(0.1)).not.toBe(y(0.3));
    expect(drops.instanceMatrix.array).toBe(before);
  });

  it("keeps every drop between the cloud and the ground", () => {
    const height = 2;
    const rain = createRain(1, height, 3, lambert);
    if (!rain) throw new Error("expected rain");
    const drops = dropsOf(rain.object);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    for (const time of [0, 0.17, 0.5, 1.3, 7.9]) {
      rain.update(time);
      for (let i = 0; i < drops.count; i++) {
        drops.getMatrixAt(i, m);
        p.setFromMatrixPosition(m);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(height + 0.6);
      }
    }
  });

  it("is not picked when the plant is tapped", () => {
    const rain = createRain(1, 2, 1, lambert);
    if (!rain) throw new Error("expected rain");
    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(0, 5, 0.2),
      new THREE.Vector3(0, -1, 0)
    );
    rain.object.updateMatrixWorld(true);
    expect(raycaster.intersectObject(rain.object, true)).toHaveLength(0);
  });
});
