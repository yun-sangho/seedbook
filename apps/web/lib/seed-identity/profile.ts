import { ANONYMOUS_USER_NAME } from "@seedbook/database/anonymous-identity";
import { isProfileImageKey, parseProfileImage } from "@web/lib/seed-identity/profile-image";

/**
 * 프로필(닉네임·씨앗 아바타) 규칙. 클라이언트 폼과 서버(`lib/auth-privacy.ts` 의 user update 훅)가
 * 같이 쓴다. 실명·사진 대신 쓰는 값이라 `user.image` 에는 씨앗 아바타 키만 받는다.
 */

export const NICKNAME_MIN_LENGTH = 2;
export const NICKNAME_MAX_LENGTH = 12;

/**
 * 운영자를 사칭하거나 욕설인 닉네임. 닉네임은 본인에게만 보여 짧게 둔다. 공백을 빼고
 * 소문자로 바꾼 닉네임에 들어 있으면 막는다.
 */
const BANNED_NICKNAME_WORDS = [
  "관리자",
  "운영자",
  "운영진",
  "seedbook",
  "시드북",
  "씨드북",
  "admin",
  "씨발",
  "시발",
  "병신",
  "개새끼",
  "좆",
  "fuck",
  "shit",
];

export type NicknameError = "empty" | "too-short" | "too-long" | "banned";

export const NICKNAME_ERROR_MESSAGES: Record<NicknameError, string> = {
  empty: "닉네임을 입력해 주세요",
  "too-short": `닉네임은 ${NICKNAME_MIN_LENGTH}자 이상이어야 해요`,
  "too-long": `닉네임은 ${NICKNAME_MAX_LENGTH}자까지 쓸 수 있어요`,
  banned: "쓸 수 없는 단어가 들어 있어요",
};

/** 앞뒤 공백을 지우고 연속된 공백을 하나로 줄인다. */
export function normalizeNickname(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/** 글자 수 (이모지 같은 서로게이트 쌍도 한 글자). */
function characterCount(text: string): number {
  return [...text].length;
}

export function nicknameError(name: string): NicknameError | null {
  const nickname = normalizeNickname(name);
  if (nickname === "") return "empty";
  const length = characterCount(nickname);
  if (length < NICKNAME_MIN_LENGTH) return "too-short";
  if (length > NICKNAME_MAX_LENGTH) return "too-long";
  const compact = nickname.replace(/\s/g, "").toLowerCase();
  if (BANNED_NICKNAME_WORDS.some((word) => compact.includes(word))) return "banned";
  return null;
}

/**
 * `user.image` 는 비우거나 씨앗 아바타 키 / 식물 아바타 키(`profile-image.ts`)만 쓴다 — 사진 URL 은
 * 받지 않는다. 식물이 본인 포트폴리오인지는 서버 훅(`lib/auth-privacy.ts`)이 따로 본다.
 */
export function profileImageError(image: string | null): "invalid" | null {
  if (image === null) return null;
  return isProfileImageKey(image) ? null : "invalid";
}

export interface ProfileUser {
  name?: string | null;
  image?: string | null;
}

/** 씨앗 아바타가 없으면 가입 단계(아바타·닉네임 정하기)를 한 번 거친다 — 새·기존 사용자 모두. */
export function needsProfileSetup(user: ProfileUser): boolean {
  return parseProfileImage(user.image).seed === null;
}

/** 가입 단계의 닉네임 초기값. 기본 이름이면 새로 뽑고, 직접 정한 이름은 그대로 둔다. */
export function setupNicknameDefault(
  name: string | null | undefined,
  generate: () => string
): string {
  const current = normalizeNickname(name ?? "");
  return current === "" || current === ANONYMOUS_USER_NAME ? generate() : current;
}
