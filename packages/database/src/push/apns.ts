import { createPrivateKey, type KeyObject, sign } from "node:crypto";
import http2 from "node:http2";

/**
 * APNs 발송 (HTTP/2 + 토큰 인증 JWT, 의존성 없이 node 내장 모듈로). 키는 Apple Developer 의 APNs 인증 키
 * (.p8) — GitHub Secret `APNS_PRIVATE_KEY_BASE64` 와 Variables `APNS_KEY_ID`·`APPLE_TEAM_ID`. 키가 없으면 발송하지 않는다.
 * 하나의 키로 운영 앱·개발용 앱(topic = 번들 ID)에 모두 보낸다.
 */

export interface ApnsConfig {
  keyId: string;
  teamId: string;
  /** PEM (.p8 내용). */
  privateKey: string;
}

export interface PushTarget {
  token: string;
  /** APNs topic (앱 번들 ID). */
  appId: string;
  /** "production" | "sandbox". */
  environment: string;
}

export interface PushMessage {
  title: string;
  body: string;
  /** 앱이 알림을 눌러 열 때 받는 값. */
  data?: Record<string, string>;
}

/** sent: 보냄, unregistered: 토큰이 더는 유효하지 않음 (지운다), failed: 다른 실패 (다음에 다시). */
export type PushResult = "sent" | "unregistered" | "failed";

export interface PushSender {
  send(target: PushTarget, message: PushMessage): Promise<PushResult>;
  close(): void;
}

/** env 에서 APNs 설정을 읽는다. 하나라도 없으면 null (발송 꺼짐). */
export function apnsConfigFromEnv(
  env: Record<string, string | undefined> = process.env
): ApnsConfig | null {
  const keyId = env.APNS_KEY_ID?.trim();
  const teamId = env.APPLE_TEAM_ID?.trim();
  const keyBase64 = env.APNS_PRIVATE_KEY_BASE64?.trim();
  if (!keyId || !teamId || !keyBase64) return null;
  const privateKey = Buffer.from(keyBase64, "base64").toString("utf8");
  return { keyId, teamId, privateKey };
}

const base64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

/** APNs 공급자 토큰 (ES256 JWT). */
export function apnsJwt(
  config: Pick<ApnsConfig, "keyId" | "teamId">,
  key: KeyObject,
  now: Date
): string {
  const header = base64url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
  const claims = base64url(
    JSON.stringify({ iss: config.teamId, iat: Math.floor(now.getTime() / 1000) })
  );
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), {
    key,
    dsaEncoding: "ieee-p1363",
  });
  return `${header}.${claims}.${base64url(signature)}`;
}

/** APNs 페이로드. */
export function apnsPayload(message: PushMessage): string {
  return JSON.stringify({
    aps: { alert: { title: message.title, body: message.body }, sound: "default" },
    ...message.data,
  });
}

/** 토큰을 지워야 하는 응답 (앱 삭제, 다른 앱·환경의 토큰). */
export function isUnregistered(status: number, reason: string | undefined): boolean {
  if (status === 410) return true;
  return reason === "BadDeviceToken" || reason === "DeviceTokenNotForTopic";
}

const PRODUCTION_HOST = "https://api.push.apple.com";
const SANDBOX_HOST = "https://api.sandbox.push.apple.com";
/** 공급자 토큰은 20~60분 사이에 새로 만든다. */
const JWT_TTL_MS = 40 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

export function createApnsSender(config: ApnsConfig): PushSender {
  const key = createPrivateKey(config.privateKey);
  const sessions = new Map<string, http2.ClientHttp2Session>();
  let jwt: { value: string; at: number } | null = null;

  const token = () => {
    const now = Date.now();
    if (!jwt || now - jwt.at > JWT_TTL_MS) {
      jwt = { value: apnsJwt(config, key, new Date(now)), at: now };
    }
    return jwt.value;
  };

  const session = (environment: string) => {
    const host = environment === "sandbox" ? SANDBOX_HOST : PRODUCTION_HOST;
    const existing = sessions.get(host);
    if (existing && !existing.closed && !existing.destroyed) return existing;
    const created = http2.connect(host);
    created.on("error", () => sessions.delete(host));
    created.on("close", () => sessions.delete(host));
    sessions.set(host, created);
    return created;
  };

  return {
    send(target, message) {
      return new Promise<PushResult>((resolve) => {
        let request: http2.ClientHttp2Stream;
        try {
          request = session(target.environment).request({
            ":method": "POST",
            ":path": `/3/device/${target.token}`,
            authorization: `bearer ${token()}`,
            "apns-topic": target.appId,
            "apns-push-type": "alert",
            "apns-priority": "10",
            "content-type": "application/json",
          });
        } catch {
          resolve("failed");
          return;
        }
        let status = 0;
        let body = "";
        request.setTimeout(REQUEST_TIMEOUT_MS, () => request.close(http2.constants.NGHTTP2_CANCEL));
        request.on("response", (headers) => {
          status = Number(headers[":status"] ?? 0);
        });
        request.setEncoding("utf8");
        request.on("data", (chunk: string) => {
          body += chunk;
        });
        request.on("error", () => resolve("failed"));
        request.on("close", () => {
          if (status === 200) return resolve("sent");
          let reason: string | undefined;
          try {
            reason = (JSON.parse(body) as { reason?: string }).reason;
          } catch {
            reason = undefined;
          }
          resolve(isUnregistered(status, reason) ? "unregistered" : "failed");
        });
        request.end(apnsPayload(message));
      });
    },
    close() {
      for (const s of sessions.values()) s.close();
      sessions.clear();
    },
  };
}
