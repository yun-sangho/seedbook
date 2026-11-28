import { describe, expect, it } from "vitest";
import {
  type BiometricLoginDeps,
  type BiometricVault,
  biometricLoginEnabledFor,
  classifyBiometricError,
  clearSignedOutMark,
  disableBiometricLogin,
  dismissBiometricLoginOffer,
  enrollBiometricLogin,
  hasBiometricLoginOnDevice,
  isSignedOutMarked,
  markSignedOut,
  readBiometricLoginEnrollment,
  shouldOfferBiometricLogin,
  signInWithBiometricLogin,
} from "./biometric-login";

type StoredCredential = { credentialId: string; token: string };

/** Keychain / Keystore 대신 쓰는 메모리 금고. `nextRead` 로 다음 읽기 결과를 바꾼다. */
function fakeVault(platform: "ios" | "android" = "ios") {
  const state = {
    stored: null as StoredCredential | null,
    verifyPasses: true,
    saveFails: false,
    readFailure: null as "cancelled" | "invalidated" | "unavailable" | "error" | null,
    verifyCalls: 0,
  };
  const vault: BiometricVault = {
    platform,
    verify: async () => {
      state.verifyCalls += 1;
      return state.verifyPasses;
    },
    save: async (credential) => {
      if (state.saveFails) return false;
      state.stored = credential;
      return true;
    },
    read: async () => {
      if (state.readFailure) return { ok: false, failure: state.readFailure };
      if (!state.stored) return { ok: false, failure: "invalidated" };
      return { ok: true, ...state.stored };
    },
    remove: async () => {
      state.stored = null;
    },
    exists: async () => state.stored !== null,
  };
  return { vault, state };
}

/** 서버 대신 쓰는 가짜 auth API. 발급·폐기된 자격 증명을 기억한다. */
function fakeServer() {
  const state = {
    enrollStatus: 200,
    issued: new Map<string, string>(),
    revoked: [] as string[],
    signedIn: [] as string[],
    failNetwork: false,
  };
  let counter = 0;
  const request: BiometricLoginDeps["request"] = async (path, body) => {
    if (state.failNetwork) throw new TypeError("Failed to fetch");
    const { credentialId = "", token = "" } = (body ?? {}) as Partial<Record<string, string>>;
    if (path === "/device-credential/enroll") {
      if (state.enrollStatus !== 200) return { status: state.enrollStatus, body: null };
      counter += 1;
      const credential = { credentialId: `cred-${counter}`, token: `token-${counter}` };
      state.issued.set(credential.credentialId, credential.token);
      return { status: 200, body: credential };
    }
    if (path === "/device-credential/revoke") {
      state.revoked.push(credentialId);
      state.issued.delete(credentialId);
      return { status: 200, body: { ok: true } };
    }
    if (path === "/device-credential/sign-in") {
      if (state.issued.get(credentialId) !== token) return { status: 401, body: null };
      state.signedIn.push(credentialId);
      return { status: 200, body: { ok: true } };
    }
    return { status: 404, body: null };
  };
  return { request, state };
}

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

function setup(platform: "ios" | "android" = "ios") {
  const vault = fakeVault(platform);
  const server = fakeServer();
  const storage = memoryStorage();
  const deps: BiometricLoginDeps = { vault: vault.vault, request: server.request, storage };
  return { deps, vault: vault.state, server: server.state, storage };
}

describe("enrollBiometricLogin", () => {
  it("stores the issued credential in the vault and remembers who it belongs to", async () => {
    const { deps, vault, storage } = setup();

    const result = await enrollBiometricLogin(deps, "user-1");

    expect(result).toBe("enrolled");
    expect(vault.stored).toEqual({ credentialId: "cred-1", token: "token-1" });
    expect(readBiometricLoginEnrollment(storage)).toEqual({
      credentialId: "cred-1",
      userId: "user-1",
    });
  });

  it("asks for Face ID first on iOS, where saving to the Keychain shows no prompt", async () => {
    const { deps, vault } = setup("ios");

    await enrollBiometricLogin(deps, "user-1");

    expect(vault.verifyCalls).toBe(1);
  });

  it("does not ask twice on Android, where saving to the Keystore already prompts", async () => {
    const { deps, vault } = setup("android");

    await enrollBiometricLogin(deps, "user-1");

    expect(vault.verifyCalls).toBe(0);
  });

  it("stops without contacting the server when the user cancels the prompt", async () => {
    const { deps, vault, server } = setup("ios");
    vault.verifyPasses = false;

    const result = await enrollBiometricLogin(deps, "user-1");

    expect(result).toBe("cancelled");
    expect(server.issued.size).toBe(0);
  });

  it("asks to sign in again when the session is too old to enroll", async () => {
    const { deps, server, storage } = setup();
    server.enrollStatus = 403;

    const result = await enrollBiometricLogin(deps, "user-1");

    expect(result).toBe("reauth-required");
    expect(readBiometricLoginEnrollment(storage)).toBeNull();
  });

  it("revokes the issued credential when the vault could not keep it", async () => {
    const { deps, vault, server, storage } = setup("android");
    vault.saveFails = true;

    const result = await enrollBiometricLogin(deps, "user-1");

    expect(result).toBe("cancelled");
    expect(server.revoked).toEqual(["cred-1"]);
    expect(readBiometricLoginEnrollment(storage)).toBeNull();
  });

  it("replaces an earlier credential on this device and revokes it", async () => {
    const { deps, server, storage } = setup();
    await enrollBiometricLogin(deps, "user-1");

    await enrollBiometricLogin(deps, "user-1");

    expect(server.revoked).toEqual(["cred-1"]);
    expect(readBiometricLoginEnrollment(storage)?.credentialId).toBe("cred-2");
  });

  it("reports a network failure", async () => {
    const { deps, server } = setup();
    server.failNetwork = true;

    expect(await enrollBiometricLogin(deps, "user-1")).toBe("failed");
  });
});

describe("signInWithBiometricLogin", () => {
  it("signs in with the credential from the vault", async () => {
    const { deps, server } = setup();
    await enrollBiometricLogin(deps, "user-1");

    const result = await signInWithBiometricLogin(deps);

    expect(result).toBe("signed-in");
    expect(server.signedIn).toEqual(["cred-1"]);
  });

  it("keeps the enrollment when the user cancels the prompt", async () => {
    const { deps, vault, storage } = setup();
    await enrollBiometricLogin(deps, "user-1");
    vault.readFailure = "cancelled";

    const result = await signInWithBiometricLogin(deps);

    expect(result).toBe("cancelled");
    expect(readBiometricLoginEnrollment(storage)).not.toBeNull();
  });

  it("forgets the enrollment when biometrics changed and the vault item is gone", async () => {
    const { deps, vault, storage } = setup();
    await enrollBiometricLogin(deps, "user-1");
    vault.readFailure = "invalidated";

    const result = await signInWithBiometricLogin(deps);

    expect(result).toBe("invalidated");
    expect(readBiometricLoginEnrollment(storage)).toBeNull();
  });

  it("treats an unexplained vault error as invalidated when the vault item is gone", async () => {
    // Android: 생체 정보가 바뀌면 플러그인이 무효 키와 데이터를 지우고 코드 0 으로 거절한다.
    const { deps, vault, storage } = setup("android");
    await enrollBiometricLogin(deps, "user-1");
    vault.readFailure = "error";
    vault.stored = null;

    const result = await signInWithBiometricLogin(deps);

    expect(result).toBe("invalidated");
    expect(readBiometricLoginEnrollment(storage)).toBeNull();
  });

  it("keeps the enrollment on an unexplained vault error while the item is still there", async () => {
    const { deps, vault, storage } = setup();
    await enrollBiometricLogin(deps, "user-1");
    vault.readFailure = "error";

    const result = await signInWithBiometricLogin(deps);

    expect(result).toBe("failed");
    expect(readBiometricLoginEnrollment(storage)).not.toBeNull();
  });

  it("forgets the enrollment and clears the vault when the server rejects it (expired or revoked)", async () => {
    const { deps, vault, server, storage } = setup();
    await enrollBiometricLogin(deps, "user-1");
    server.issued.clear();

    const result = await signInWithBiometricLogin(deps);

    expect(result).toBe("invalidated");
    expect(vault.stored).toBeNull();
    expect(readBiometricLoginEnrollment(storage)).toBeNull();
  });

  it("keeps the enrollment on a network failure so the user can retry", async () => {
    const { deps, server, storage } = setup();
    await enrollBiometricLogin(deps, "user-1");
    server.failNetwork = true;

    const result = await signInWithBiometricLogin(deps);

    expect(result).toBe("failed");
    expect(readBiometricLoginEnrollment(storage)).not.toBeNull();
  });
});

describe("disableBiometricLogin", () => {
  it("revokes the credential and clears the vault and the enrollment", async () => {
    const { deps, vault, server, storage } = setup();
    await enrollBiometricLogin(deps, "user-1");

    await disableBiometricLogin(deps);

    expect(server.revoked).toEqual(["cred-1"]);
    expect(vault.stored).toBeNull();
    expect(readBiometricLoginEnrollment(storage)).toBeNull();
  });

  it("still clears this device when the server cannot be reached", async () => {
    const { deps, vault, server, storage } = setup();
    await enrollBiometricLogin(deps, "user-1");
    server.failNetwork = true;

    await disableBiometricLogin(deps);

    expect(vault.stored).toBeNull();
    expect(readBiometricLoginEnrollment(storage)).toBeNull();
  });
});

describe("readBiometricLoginEnrollment", () => {
  it("ignores a malformed stored value", () => {
    const storage = memoryStorage();
    storage.setItem("seedbook.biometric-login", "{not json");

    expect(readBiometricLoginEnrollment(storage)).toBeNull();
  });
});

describe("classifyBiometricError", () => {
  it.each([
    ["16", "cancelled"], // user cancel
    ["10", "cancelled"], // authentication failed
    ["15", "cancelled"], // system cancel
    ["21", "invalidated"], // no protected credentials (deleted or biometrics changed on iOS)
    ["3", "unavailable"], // no biometrics enrolled
    ["2", "unavailable"], // locked out
  ])("maps plugin code %s to %s", (code, expected) => {
    expect(classifyBiometricError({ code, message: "x" })).toBe(expected);
  });

  it("treats Android's 'Biometric enrollment changed' as invalidated", () => {
    expect(classifyBiometricError({ code: "0", message: "Biometric enrollment changed" })).toBe(
      "invalidated"
    );
  });

  it("treats anything else as an error", () => {
    expect(classifyBiometricError(new Error("boom"))).toBe("error");
  });
});

describe("shouldOfferBiometricLogin", () => {
  const now = new Date("2026-11-16T12:00:00Z");
  const justSignedIn = new Date("2026-11-16T11:59:00Z");

  it("offers right after signing in when this device has no enrollment", () => {
    const storage = memoryStorage();

    expect(
      shouldOfferBiometricLogin(storage, { userId: "user-1", sessionCreatedAt: justSignedIn, now })
    ).toBe(true);
  });

  it("does not offer once the user enrolled", async () => {
    const { deps, storage } = setup();
    await enrollBiometricLogin(deps, "user-1");

    expect(
      shouldOfferBiometricLogin(storage, { userId: "user-1", sessionCreatedAt: justSignedIn, now })
    ).toBe(false);
  });

  it("offers to another account signing in on a device enrolled for someone else", async () => {
    const { deps, storage } = setup();
    await enrollBiometricLogin(deps, "user-1");

    expect(
      shouldOfferBiometricLogin(storage, { userId: "user-2", sessionCreatedAt: justSignedIn, now })
    ).toBe(true);
  });

  it("does not offer again after the user said not now", () => {
    const storage = memoryStorage();
    dismissBiometricLoginOffer(storage);

    expect(
      shouldOfferBiometricLogin(storage, { userId: "user-1", sessionCreatedAt: justSignedIn, now })
    ).toBe(false);
  });

  it("does not offer on an old session, which the server would refuse to enroll", () => {
    const storage = memoryStorage();
    const yesterday = new Date("2026-11-15T11:00:00Z");

    expect(
      shouldOfferBiometricLogin(storage, { userId: "user-1", sessionCreatedAt: yesterday, now })
    ).toBe(false);
  });
});

describe("signed-out mark (no automatic prompt after signing out, until signed in again)", () => {
  it("is absent by default, so the prompt opens on app launch", () => {
    expect(isSignedOutMarked(memoryStorage())).toBe(false);
  });

  it("stays while the login screen re-renders and the page reloads after signing out", () => {
    const session = memoryStorage();
    markSignedOut(session);

    expect(isSignedOutMarked(session)).toBe(true);
    expect(isSignedOutMarked(session)).toBe(true);
  });

  it("is cleared once the user signs in again", () => {
    const session = memoryStorage();
    markSignedOut(session);

    clearSignedOutMark(session);

    expect(isSignedOutMarked(session)).toBe(false);
  });
});

describe("biometricLoginEnabledFor (settings status follows the Keychain vault)", () => {
  it("is on when this user enrolled and the vault still holds the token", async () => {
    const { deps } = setup();
    await enrollBiometricLogin(deps, "user-1");

    expect(await biometricLoginEnabledFor(deps, "user-1")).toBe(true);
  });

  it("is off for another account on the same device", async () => {
    const { deps } = setup();
    await enrollBiometricLogin(deps, "user-1");

    expect(await biometricLoginEnabledFor(deps, "user-2")).toBe(false);
  });

  it("is off and forgets the stale enrollment when the vault item is gone", async () => {
    // 금고 항목이 없어졌다 (생체 정보 변경, 다른 키로 저장된 옛 항목, 앱 재설치).
    const { deps, vault, storage } = setup();
    await enrollBiometricLogin(deps, "user-1");
    vault.stored = null;

    expect(await biometricLoginEnabledFor(deps, "user-1")).toBe(false);
    expect(readBiometricLoginEnrollment(storage)).toBeNull();
  });

  it("is off when the vault holds a token but this device does not know whose it is", async () => {
    const { deps, vault } = setup();
    vault.stored = { credentialId: "cred-x", token: "token-x" };

    expect(await biometricLoginEnabledFor(deps, "user-1")).toBe(false);
  });
});

describe("hasBiometricLoginOnDevice (login screen button and automatic prompt)", () => {
  it("is true when the vault holds a token", async () => {
    const { deps } = setup();
    await enrollBiometricLogin(deps, "user-1");

    expect(await hasBiometricLoginOnDevice(deps)).toBe(true);
  });

  it("is false without a vault item, so no prompt opens just to fail", async () => {
    const { deps, vault, storage } = setup();
    await enrollBiometricLogin(deps, "user-1");
    vault.stored = null;

    expect(await hasBiometricLoginOnDevice(deps)).toBe(false);
    expect(readBiometricLoginEnrollment(storage)).toBeNull();
  });

  it("is true when the vault holds a token even if this device lost its enrollment note", async () => {
    const { deps, vault } = setup();
    vault.stored = { credentialId: "cred-x", token: "token-x" };

    expect(await hasBiometricLoginOnDevice(deps)).toBe(true);
  });

  it("treats a failing existence check as no vault item", async () => {
    const { deps } = setup();
    deps.vault.exists = async () => {
      throw new Error("keychain unavailable");
    };

    expect(await hasBiometricLoginOnDevice(deps)).toBe(false);
  });
});
