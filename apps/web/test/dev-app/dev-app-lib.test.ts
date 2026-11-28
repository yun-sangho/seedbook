import { createPublicKey } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assertAppPublicKey,
  signBundle,
  verifyBundleSignature,
} from "../../../../scripts/app-bundle-lib.mjs";
import {
  createLocalOtaKeys,
  devAppApiBaseUrl,
  devAppOtaEnv,
  findSimulator,
  localOtaPaths,
  localPublishIds,
  parseWebPort,
  pickIosDevice,
  pickLanAddress,
  pickSimulatorTarget,
  readEnvValue,
  simulatorLimitError,
  simulatorName,
  teamIdFromCertificateSubject,
} from "../../../../scripts/dev-app-lib.mjs";

describe("pickLanAddress", () => {
  const ipv4 = (address: string, internal = false) => ({ address, family: "IPv4", internal });

  it("prefers en0 (the Mac's Wi-Fi) over other interfaces", () => {
    expect(
      pickLanAddress({
        bridge100: [ipv4("192.168.64.1")],
        en0: [{ address: "fe80::1", family: "IPv6", internal: false }, ipv4("192.168.0.12")],
      })
    ).toBe("192.168.0.12");
  });

  it("falls back to another private IPv4 when en0 has none", () => {
    expect(
      pickLanAddress({
        lo0: [ipv4("127.0.0.1", true)],
        en0: [],
        en5: [ipv4("10.0.1.20")],
      })
    ).toBe("10.0.1.20");
  });

  it("skips VPN, bridge and link-local addresses", () => {
    expect(
      pickLanAddress({
        utun4: [ipv4("10.8.0.2")],
        bridge100: [ipv4("192.168.64.1")],
        en7: [ipv4("169.254.10.2")],
      })
    ).toBeNull();
  });
});

describe("parseWebPort", () => {
  it("reads the web port from `pnpm wt:info`", () => {
    const info = [
      "slot 2  /Users/me/.herdr/worktrees/seedbook/feat-x",
      "  web      http://localhost:4021  (pnpm dev — 앱 Vite, 여기를 연다)",
      "  API      http://localhost:4022  (Next: /api·소개·약관, web 이 넘긴다)",
    ].join("\n");
    expect(parseWebPort(info)).toBe(4021);
  });

  it("returns null when the output has no web line", () => {
    expect(parseWebPort("slot 0")).toBeNull();
  });
});

describe("devAppApiBaseUrl", () => {
  it("points the bundle at the Mac's LAN address and the slot web port", () => {
    expect(devAppApiBaseUrl({ host: "192.168.0.12", port: 4021 })).toBe("http://192.168.0.12:4021");
  });
});

describe("pickIosDevice", () => {
  const device = (
    udid: string,
    { reality = "physical", tunnelState = "connected", platform = "iOS", name = udid } = {}
  ) => ({
    identifier: `core-${udid}`,
    hardwareProperties: { udid, platform, reality },
    connectionProperties: { tunnelState, pairingState: "paired" },
    deviceProperties: { name },
  });
  const list = (...devices: ReturnType<typeof device>[]) => ({ result: { devices } });

  it("picks the one connected physical iPhone and skips simulators", () => {
    expect(
      pickIosDevice(list(device("SIM-1", { reality: "simulated" }), device("00008150-AAA")))
    ).toEqual({ udid: "00008150-AAA", name: "00008150-AAA" });
  });

  it("ignores devices that are not connected", () => {
    expect(() =>
      pickIosDevice(list(device("00008150-AAA", { tunnelState: "unavailable" })))
    ).toThrow(/연결된 아이폰/);
  });

  it("asks to choose when several iPhones are connected", () => {
    expect(() => pickIosDevice(list(device("A"), device("B")))).toThrow(/SEEDBOOK_IOS_DEVICE/);
  });
});

describe("teamIdFromCertificateSubject", () => {
  it("reads the team id (OU) from an Apple Development certificate subject", () => {
    expect(
      teamIdFromCertificateSubject(
        "subject=UID=ABC, CN=Apple Development: Someone (XYZ123), OU=TEAM123456, O=Someone, C=US"
      )
    ).toBe("TEAM123456");
  });

  it("returns null without an OU", () => {
    expect(teamIdFromCertificateSubject("subject=CN=Other")).toBeNull();
  });
});

describe("readEnvValue", () => {
  it("reads a KEY=VALUE line, ignoring comments and quotes", () => {
    const text = ["# KAKAO_NATIVE_APP_KEY=old", "OTHER=1", 'KAKAO_NATIVE_APP_KEY="abc123"'].join(
      "\n"
    );
    expect(readEnvValue(text, "KAKAO_NATIVE_APP_KEY")).toBe("abc123");
  });

  it("returns null for a missing or empty value", () => {
    expect(readEnvValue("KAKAO_NATIVE_APP_KEY=\n", "KAKAO_NATIVE_APP_KEY")).toBeNull();
    expect(readEnvValue("OTHER=1", "KAKAO_NATIVE_APP_KEY")).toBeNull();
  });
});

describe("simulatorName", () => {
  it("names the session simulator after the worktree folder", () => {
    expect(simulatorName("/Users/me/.herdr/worktrees/seedbook/feat-mobile-dev-app")).toBe(
      "seedbook-feat-mobile-dev-app"
    );
  });
});

describe("findSimulator", () => {
  const list = {
    devices: {
      "com.apple.CoreSimulator.SimRuntime.iOS-27-2": [
        { name: "seedbook-other", udid: "OTHER", state: "Booted", isAvailable: true },
        { name: "seedbook-feat-x", udid: "MINE", state: "Shutdown", isAvailable: true },
      ],
    },
  };

  it("finds this session's simulator by exact name", () => {
    expect(findSimulator(list, "seedbook-feat-x")).toEqual({ udid: "MINE", state: "Shutdown" });
  });

  it("returns null when it does not exist yet", () => {
    expect(findSimulator(list, "seedbook-feat-y")).toBeNull();
  });
});

describe("pickSimulatorTarget", () => {
  const type = (name: string) => ({ identifier: `com.apple.CoreSimulator.SimDeviceType.${name}` });
  const runtime = (identifier: string, version: string, types: string[]) => ({
    identifier,
    version,
    platform: "iOS",
    isAvailable: true,
    supportedDeviceTypes: types.map(type),
  });

  it("uses the newest general iOS runtime and the newest iPhone SE (the lightest model)", () => {
    expect(
      pickSimulatorTarget({
        runtimes: [
          runtime("iOS-26-0", "26.0", ["iPhone-SE-3rd-generation"]),
          runtime("iOS-27-2-iPhone19-4", "27.2", ["iPhone-Duo"]),
          runtime("iOS-27-2", "27.2", [
            "iPhone-18-Pro",
            "iPhone-17e",
            "iPhone-SE-3rd-generation",
            "iPhone-16",
            "iPhone-SE--2nd-generation-",
            "iPad-Air",
          ]),
        ],
      })
    ).toEqual({ runtime: "iOS-27-2", deviceType: type("iPhone-SE-3rd-generation").identifier });
  });

  it("falls back to the smallest base iPhone (mini, then the oldest plain model) without an SE", () => {
    const pick = (types: string[]) =>
      pickSimulatorTarget({ runtimes: [runtime("iOS-28-0", "28.0", types)] }).deviceType;
    expect(pick(["iPhone-18-Pro", "iPhone-13-mini", "iPhone-17", "iPhone-12-mini"])).toBe(
      type("iPhone-13-mini").identifier
    );
    expect(pick(["iPhone-18-Pro-Max", "iPhone-18", "iPhone-17e", "iPhone-17", "iPhone-Air"])).toBe(
      type("iPhone-17e").identifier
    );
    expect(pick(["iPhone-18-Pro", "iPhone-18-Pro-Max"])).toBe(type("iPhone-18-Pro").identifier);
  });

  it("throws when no iOS runtime is installed", () => {
    expect(() => pickSimulatorTarget({ runtimes: [] })).toThrow(/런타임/);
  });
});

describe("simulatorLimitError", () => {
  const device = (name: string, state: string) => ({
    name,
    udid: `UDID-${name}`,
    state,
    isAvailable: true,
  });
  const list = (...devices: ReturnType<typeof device>[]) => ({
    devices: { "com.apple.CoreSimulator.SimRuntime.iOS-27-2": devices },
  });

  it("allows booting while fewer than two seedbook simulators are on", () => {
    expect(
      simulatorLimitError(
        list(device("seedbook-a", "Booted"), device("seedbook-b", "Shutdown")),
        "seedbook-mine"
      )
    ).toBeNull();
  });

  it("ignores simulators that are not seedbook sessions", () => {
    expect(
      simulatorLimitError(
        list(
          device("iPhone 17", "Booted"),
          device("other-app", "Booted"),
          device("seedbook-a", "Booted")
        ),
        "seedbook-mine"
      )
    ).toBeNull();
  });

  it("refuses a third simulator and names the sessions that hold the two", () => {
    const error = simulatorLimitError(
      list(device("seedbook-a", "Booted"), device("seedbook-b", "Booted")),
      "seedbook-mine"
    );
    expect(error).toMatch(/seedbook-a/);
    expect(error).toMatch(/seedbook-b/);
    expect(error).toMatch(/--force/);
  });

  it("lets the session reuse its own simulator when it is already on", () => {
    expect(
      simulatorLimitError(
        list(device("seedbook-a", "Booted"), device("seedbook-mine", "Booted")),
        "seedbook-mine"
      )
    ).toBeNull();
  });
});

describe("localOtaPaths", () => {
  it("keeps the local OTA keys in ~/.seedbook/ota-dev, outside the repo", () => {
    expect(localOtaPaths({}, "/Users/me/")).toEqual({
      dir: "/Users/me/.seedbook/ota-dev",
      signingKey: "/Users/me/.seedbook/ota-dev/signing.pem",
      publicKey: "/Users/me/.seedbook/ota-dev/public.pem",
      adminToken: "/Users/me/.seedbook/ota-dev/admin-token",
    });
  });

  it("uses SEEDBOOK_OTA_DEV_DIR when given", () => {
    expect(localOtaPaths({ SEEDBOOK_OTA_DEV_DIR: " /tmp/ota " }, "/Users/me").publicKey).toBe(
      "/tmp/ota/public.pem"
    );
  });
});

describe("createLocalOtaKeys", () => {
  const keys = createLocalOtaKeys();

  it("makes a public key the app plugin can verify with (2048-bit RSA PEM)", () => {
    expect(() => assertAppPublicKey(keys.publicKey)).not.toThrow();
  });

  it("makes a signing key that pairs with that public key", () => {
    const zip = Buffer.from("bundle");
    const { signature } = signBundle(zip, keys.signingKey);
    expect(verifyBundleSignature(zip, signature, keys.publicKey)).toBe(true);
  });

  it("makes an admin token long enough for the dev server to enable the admin API", () => {
    expect(keys.adminToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it("makes a different key pair each time", () => {
    expect(createLocalOtaKeys().publicKey).not.toBe(keys.publicKey);
  });
});

describe("devAppOtaEnv", () => {
  it("builds the Dev app on the beta channel with the given public key", () => {
    const pem = createPublicKey(createLocalOtaKeys().signingKey).export({
      type: "spki",
      format: "pem",
    }) as string;
    expect(devAppOtaEnv(`${pem}\n`)).toEqual({
      SEEDBOOK_OTA_CHANNEL: "beta",
      SEEDBOOK_OTA_PUBLIC_KEY: pem.trim(),
    });
  });
});

describe("localPublishIds", () => {
  const sha = "0123456789abcdef0123456789abcdef01234567";

  it("uses the commit sha as the build and the time in seconds as the run number", () => {
    expect(localPublishIds(sha, 1_764_300_000_999)).toEqual({ build: sha, run: "1764300000" });
  });

  it("gives a later publish of the same commit a larger run number", () => {
    const first = Number(localPublishIds(sha, 1_764_300_000_000).run);
    const second = Number(localPublishIds(sha, 1_764_300_001_000).run);
    expect(second).toBeGreaterThan(first);
  });
});
