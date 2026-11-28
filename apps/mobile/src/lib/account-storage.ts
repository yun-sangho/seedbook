"use client";

import {
  ACCOUNT_SNAPSHOT_STORAGE_KEY,
  HOLDINGS_HISTORY_STORAGE_KEY,
} from "@mobile/features/investments/utils/account-value-history";
import type { StateStorage } from "zustand/middleware";
import { ACCOUNT_HEADER } from "./account-header";
import { apiFetch } from "./api-client";
import {
  afterDeviceStorageReady,
  type DeviceStorage,
  getDeviceStorage,
  RECORD_DOCUMENT_KEY,
  reloadApp,
} from "./device-storage";
import {
  BIOMETRIC_LOGIN_STORAGE_KEY,
  readBiometricLoginEnrollment,
} from "./native/biometric-login";
import type { DeviceRecordStore } from "./sync/v2/device-record-store";
import { QUARANTINE_KEY, SYNC_STATE_KEY } from "./sync/v2/record-layer";
import { RECORD_STORE_KEYS } from "./sync/v2/store-records";

/**
 * 계정별 기기 데이터. 한 기기에서 여러 계정이 로그인해도 자산·동기화 대기열·저장소 모드·개인
 * 설정이 섞이지 않게 계정마다 저장 자리(slot)를 나눈다.
 *
 *   - **기본 자리**: 이 기기를 처음 쓴 계정. 원래 키(앱은 SQLite 자산 테이블)를 그대로 쓰고
 *     `seedbook.owner` 에 userId 를 적는다. 데이터를 옮기지 않아 예전 버전으로 되돌려도 읽힌다.
 *   - **계정 자리**: 그 밖의 계정. `seedbook.account.<userId>.<원래 키>` (앱은 `device_kv`).
 *
 * 로그인 사용자를 알기 전(`activateAccount` 전)에는 아무것도 읽거나 쓰지 않는다. 한 페이지의
 * 계정은 한 번 정해지면 바뀌지 않는다 — 다른 계정이 되면 자리를 닫고 새로고침한다. 시세 캐시,
 * 앱 잠금처럼 계정과 무관한 기기 상태는 `getDeviceStorage()` 를 직접 쓴다.
 */
export const DEVICE_OWNER_KEY = "seedbook.owner";
const ACCOUNT_PREFIX = "seedbook.account.";

/**
 * 예전 버전(동기화 v1)이 남긴 동기화 대기열 키. 읽지 않지만 기본 자리의 주인을 정하는 근거이고,
 * 탈퇴 때 함께 지운다.
 */
const SYNC_META_KEYS = [
  "seedbook.sync.investment",
  "seedbook.sync.portfolio",
  "seedbook.sync.rebalancing",
];
/** 자산 store 의 persist 키. 자산은 레코드(`RECORD_DOCUMENT_KEY`)에 두고, 예전 버전의 envelope 가 남아 있을 수 있다. */
const ASSET_ENVELOPE_KEYS = RECORD_STORE_KEYS;
const ACCOUNT_ENVELOPE_KEYS = [
  ...ASSET_ENVELOPE_KEYS,
  "seedbook.preferences",
  ACCOUNT_SNAPSHOT_STORAGE_KEY,
  HOLDINGS_HISTORY_STORAGE_KEY,
];
const ACCOUNT_ITEM_KEYS = [
  ...SYNC_META_KEYS,
  // `lib/consent-client.ts` CONSENT_AGREED_KEY (그 모듈이 이 모듈을 import 해 이름으로 둔다).
  "seedbook.consentAgreed",
  "seedbook.storageMode",
  RECORD_DOCUMENT_KEY,
  SYNC_STATE_KEY,
  QUARANTINE_KEY,
];

type Slot = { userId: string; prefix: string };

/** `undefined`: 아직 모름, `null`: 로그인하지 않음(또는 닫힘). */
let account: string | null | undefined;
let slot: Slot | null = null;
/** 요청 헤더에 쓰는 계정. 자리를 닫은 뒤에도 남겨, 닫히기 전에 시작한 요청이 새 계정으로 나가지 않게 한다. */
let requestAccount: string | null = null;
let activation: Promise<void> | null = null;
let markKnown: () => void = () => undefined;
let known = newKnownPromise();
const listeners = new Set<() => void>();

function newKnownPromise(): Promise<void> {
  return new Promise((resolve) => {
    markKnown = resolve;
  });
}

export function getActiveAccount(): string | null | undefined {
  return account;
}

export function subscribeActiveAccount(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function settle(userId: string | null, next: Slot | null): void {
  account = userId;
  slot = next;
  if (userId !== null) requestAccount = userId;
  markKnown();
  for (const listener of listeners) listener();
}

const accountPrefix = (userId: string) => `${ACCOUNT_PREFIX}${userId}.`;

/** 예전 버전이 남긴 동기화 대기열에 적힌 사용자들. */
function legacyOwners(device: DeviceStorage): Set<string> {
  const owners = new Set<string>();
  for (const key of SYNC_META_KEYS) {
    try {
      const parsed = JSON.parse(device.getItem(key) ?? "null") as { userId?: unknown } | null;
      if (typeof parsed?.userId === "string" && parsed.userId) owners.add(parsed.userId);
    } catch {
      // 손상된 값은 근거로 쓰지 않는다.
    }
  }
  return owners;
}

/** 로그인한 사용자의 저장 자리를 정한다. 주인 없는 기본 자리면 근거에 따라 주인을 적는다. */
function resolveSlot(device: DeviceStorage, userId: string): Slot {
  const base = { userId, prefix: "" };
  const own = { userId, prefix: accountPrefix(userId) };
  const owner = device.getItem(DEVICE_OWNER_KEY);
  if (owner === userId) return base;
  if (owner !== null || device.getItem(`${own.prefix}${DEVICE_OWNER_KEY}`) === userId) return own;

  const evidence = [...legacyOwners(device)];
  // 여러 사람의 흔적이 섞였으면 누구의 것도 아닌 채로 둔다.
  if (evidence.length > 1) return own;
  const inferred = evidence[0] ?? userId;
  device.setItem(DEVICE_OWNER_KEY, inferred);
  return inferred === userId ? base : own;
}

/**
 * 세션이 확인될 때마다 부른다. 처음이면 그 계정의 자리를 열고, 이미 다른 계정으로 열려 있으면
 * 자리를 닫고 새로고침한다 (store 메모리에 앞 계정의 데이터가 남아 있어서). 로그아웃은 자리를
 * 바꾸지 않는다.
 */
export async function activateAccount(userId: string | null): Promise<void> {
  if (activation === null) {
    activation = (async () => {
      const device = getDeviceStorage();
      if (!device.isReady()) await device.whenReady();
      if (userId === null) {
        settle(null, null);
        return;
      }
      const resolved = resolveSlot(device, userId);
      const marker = `${resolved.prefix}${DEVICE_OWNER_KEY}`;
      if (device.getItem(marker) !== userId) device.setItem(marker, userId);
      settle(userId, resolved);
    })();
    return activation;
  }
  await activation;
  if (userId === null || userId === account) return;
  settle(null, null);
  await reloadApp();
}

/** 저장소와 로그인 사용자가 모두 정해진 뒤 `fn` 을 부른다. 이미 정해졌으면 동기로 끝난다. */
export function afterAccountReady<T>(fn: () => T | PromiseLike<T>): T | PromiseLike<T> {
  return account === undefined ? known.then(() => afterDeviceStorageReady(fn)) : fn();
}

/** 지금 자리. 그 사이 주인이 바뀌었으면 (다른 탭에서 탈퇴하고 다른 계정이 기본 자리를 쓰는 경우) null. */
function writableSlot(device: DeviceStorage): Slot | null {
  if (!slot) return null;
  const marker = `${slot.prefix}${DEVICE_OWNER_KEY}`;
  const owner = device.getItem(marker);
  if (owner === null) device.setItem(marker, slot.userId);
  return owner === null || owner === slot.userId ? slot : null;
}

function withSlot<T>(fn: (device: DeviceStorage, prefix: string) => T, fallback: T): T {
  const device = getDeviceStorage();
  const current = writableSlot(device);
  return current ? fn(device, current.prefix) : fallback;
}

/** 지금 로그인한 계정의 기기 데이터. 계정이 정해지기 전이나 로그아웃 상태면 비어 있다. */
export const accountStorage = {
  getItem: (key: string) => withSlot((d, p) => d.getItem(p + key), null),
  setItem: (key: string, value: string) => withSlot((d, p) => d.setItem(p + key, value), undefined),
  removeItem: (key: string) => withSlot((d, p) => d.removeItem(p + key), undefined),
  readEnvelope: (key: string) =>
    withSlot<string | null | Promise<string | null>>((d, p) => d.readEnvelope(p + key), null),
  writeEnvelope: (key: string, value: string) =>
    withSlot<void | Promise<void>>((d, p) => d.writeEnvelope(p + key, value), undefined),
  removeEnvelope: (key: string) =>
    withSlot<void | Promise<void>>((d, p) => d.removeEnvelope(p + key), undefined),
  /** 이 계정의 자산 레코드 저장소. 계정이 정해지기 전이면 null. */
  recordStore: () => withSlot<DeviceRecordStore | null>((d, p) => d.recordStore(p), null),
  clear: clearAccountData,
};

/** 저장소 모드와 상관없이 이 기기에 계정별로 두는 persist store 의 `StateStorage`. */
export function createAccountStateStorage(): StateStorage {
  return {
    getItem: (name) => afterAccountReady<string | null>(() => accountStorage.readEnvelope(name)),
    setItem: (name, value) => afterAccountReady(() => accountStorage.writeEnvelope(name, value)),
    removeItem: (name) => afterAccountReady(() => accountStorage.removeEnvelope(name)),
  };
}

async function hasOtherAccounts(device: DeviceStorage, mine: Slot): Promise<boolean> {
  const own = accountPrefix(mine.userId);
  if (device.keys().some((k) => k.startsWith(ACCOUNT_PREFIX) && !k.startsWith(own))) return true;
  if (mine.prefix === "") return false;
  if (device.getItem(DEVICE_OWNER_KEY) !== null) return true;
  for (const key of ASSET_ENVELOPE_KEYS) {
    if ((await device.readEnvelope(key)) !== null) return true;
  }
  return device.getItem(RECORD_DOCUMENT_KEY) !== null;
}

/**
 * 회원 탈퇴: 이 계정의 기기 데이터를 지우고 자리를 닫는다. 다른 계정의 데이터가 없으면
 * 기기 데이터를 통째로 비운다.
 */
async function clearAccountData(): Promise<void> {
  const device = getDeviceStorage();
  const mine = writableSlot(device);
  // 지우는 동안 store 가 다시 쓰지 못하게 먼저 닫는다.
  settle(null, null);
  if (!mine) return;

  if (!(await hasOtherAccounts(device, mine))) {
    await device.clear();
    return;
  }
  for (const key of ACCOUNT_ENVELOPE_KEYS) await device.removeEnvelope(mine.prefix + key);
  for (const key of ACCOUNT_ITEM_KEYS) device.removeItem(mine.prefix + key);
  device.removeItem(mine.prefix + DEVICE_OWNER_KEY);
  // 이 계정이 보던 종목이 남으므로 공용 시세 캐시도 비운다 (다시 받을 수 있다).
  await device.removeEnvelope("stock-price-cache");
  if (readBiometricLoginEnrollment(device)?.userId === mine.userId) {
    device.removeItem(BIOMETRIC_LOGIN_STORAGE_KEY);
  }
  await device.flush();
}

/**
 * 동의를 거부해 방금 만든 계정이 지워질 때: 이 계정이 자리의 주인이라는 표시만 지우고 자리를
 * 닫는다. 데이터는 남긴다 — 새 계정은 동의 전에 아무것도 쓰지 않으므로 기본 자리에 있는 것은 주인을
 * 모르던 예전 데이터이고, 표시를 두면 없어진 계정의 것이 되어 아무도 볼 수 없다.
 */
export async function releaseAccountSlot(): Promise<void> {
  const device = getDeviceStorage();
  const mine = slot;
  settle(null, null);
  if (!mine) return;
  const marker = `${mine.prefix}${DEVICE_OWNER_KEY}`;
  if (device.getItem(marker) === mine.userId) device.removeItem(marker);
  await device.flush();
}

/**
 * 계정 데이터를 주고받는 요청. 이 페이지의 계정을 알려, 다른 탭에서 계정이 바뀐 뒤(쿠키는 새
 * 계정)에는 서버가 거절하게 한다.
 */
export const accountFetch: typeof fetch = (input, init) => {
  if (!requestAccount) return apiFetch(input, init);
  return apiFetch(input, {
    ...init,
    headers: { ...(init?.headers as Record<string, string>), [ACCOUNT_HEADER]: requestAccount },
  });
};

/** 테스트 전용: 새로고침한 것처럼 계정을 모르는 상태로 되돌린다. */
export function __resetAccountForTests(): void {
  account = undefined;
  slot = null;
  requestAccount = null;
  activation = null;
  known = newKnownPromise();
}
