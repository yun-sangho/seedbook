// www-src/ 를 www/ 로 복사하면서 __SERVER_URL__ 을 앱이 띄울 서버 주소로 바꾼다.
// capacitor.config.ts 와 같은 규칙: CAP_SERVER_URL, 없으면 운영 주소.
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_SERVER_URL = "https://seedbook.boogie.ing";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceDir = path.join(root, "www-src");
const outputDir = path.join(root, "www");
const serverUrl = process.env.CAP_SERVER_URL ?? DEFAULT_SERVER_URL;

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
for (const name of await readdir(sourceDir)) {
  const text = await readFile(path.join(sourceDir, name), "utf8");
  await writeFile(path.join(outputDir, name), text.replaceAll("__SERVER_URL__", serverUrl));
}
console.log(`www/ built for ${serverUrl}`);
