import { createAuthClient } from "better-auth/react";
import { API_BASE_URL } from "./api-client";

// API 서버 주소가 따로면 그쪽 `/api/auth` 로. 비어 있으면 better-auth 가 같은 origin 을 쓴다 (지금 동작).
// biome-ignore lint/suspicious/noExplicitAny: 추론 타입이 better-auth 내부 타입을 참조해 이름 붙여 export 할 수 없다 (TS2742).
export const authClient: any = createAuthClient({ baseURL: API_BASE_URL || undefined });
export const { useSession, signIn, signOut } = authClient;
