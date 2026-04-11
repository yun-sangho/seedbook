import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@web/lib/auth";

export const { GET, POST } = toNextJsHandler(auth);
