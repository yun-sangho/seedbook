// 앱 화면(Vite SPA, apps/mobile)의 빌드 결과를 웹 서버의 public/_app/ 로 복사한다. `next build` 전에
// 돈다 (package.json build). 앱 빌드는 먼저 따로 한다 — turbo 는 `^build` 로, Dockerfile·CI 는 직접.
//   apps/mobile/dist/index.html  → public/_app/index.html  (proxy.ts 가 앱 경로를 이 파일로 rewrite)
//   apps/mobile/dist/_app/*      → public/_app/*           (index.html 이 /_app/... 로 부른다)
import { cpSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.resolve(webDir, "../mobile/dist");
const outDir = path.join(webDir, "public/_app");

if (!existsSync(path.join(distDir, "index.html"))) {
  console.error(
    `[copy-app] ${distDir}/index.html 이 없다. 먼저 pnpm --filter @seedbook/mobile build`
  );
  process.exit(1);
}
rmSync(outDir, { recursive: true, force: true });
cpSync(path.join(distDir, "_app"), outDir, { recursive: true });
cpSync(path.join(distDir, "index.html"), path.join(outDir, "index.html"));
console.log(`[copy-app] ${path.relative(webDir, distDir)} → public/_app`);
