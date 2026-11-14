import { createAuthClient } from "better-auth/react";

// biome-ignore lint/suspicious/noExplicitAny: 추론 타입이 better-auth 내부 타입을 참조해 이름 붙여 export 할 수 없다 (TS2742).
export const authClient: any = createAuthClient();
export const { useSession, signIn, signOut } = authClient;
