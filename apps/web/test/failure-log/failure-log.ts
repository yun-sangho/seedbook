import { mkdirSync, writeFileSync } from "node:fs";
import { loadavg } from "node:os";
import { join } from "node:path";
import type { Reporter, SerializedError, TestModule, Vite } from "vitest/node";

/** 오류 하나를 메시지·스택으로 적는다. vitest 안쪽 스택은 뺀다. */
function errorText(error: SerializedError): string {
  const message = `${error.name ?? "Error"}: ${error.message}`;
  if (!error.stack) return message;
  const stack = error.stack
    .split("\n")
    .filter((line) => !line.includes("/node_modules/vitest/"))
    .join("\n");
  // 스택 첫머리에는 보통 메시지가 들어 있다.
  return stack.includes(error.message) ? stack : `${message}\n${stack}`;
}

function entry(title: string, errors: ReadonlyArray<SerializedError>): string {
  return [`FAIL ${title}`, ...errors.map(errorText)].join("\n");
}

/** 실패한 테스트와 테스트 밖 오류(파일 로딩·describe·처리되지 않은 오류)를 적는다. */
function failureEntries(
  modules: ReadonlyArray<TestModule>,
  unhandled: ReadonlyArray<SerializedError>
): string[] {
  const entries: string[] = [];
  for (const module of modules) {
    const file = module.relativeModuleId;
    if (module.errors().length > 0) entries.push(entry(file, module.errors()));
    for (const suite of module.children.allSuites()) {
      if (suite.errors().length > 0)
        entries.push(entry(`${file} > ${suite.fullName}`, suite.errors()));
    }
    for (const test of module.children.allTests("failed")) {
      const duration = Math.round(test.diagnostic()?.duration ?? 0);
      entries.push(entry(`${file} > ${test.fullName} (${duration}ms)`, test.result().errors ?? []));
    }
  }
  if (unhandled.length > 0) entries.push(entry("(unhandled)", unhandled));
  return entries;
}

/** 실패한 실행마다 파일을 하나 남긴다. 다시 돌려 통과해도 앞의 기록이 남도록 덮어쓰지 않는다. */
export function failureLogReporter(dir: string): Reporter {
  return {
    async onTestRunEnd(modules, unhandled) {
      const entries = failureEntries(modules, unhandled);
      if (entries.length === 0) return;

      const now = new Date().toISOString();
      const header = [
        `time: ${now}`,
        `load: ${loadavg()
          .map((load) => load.toFixed(1))
          .join(" ")}`,
        `args: ${process.argv.slice(2).join(" ")}`,
      ].join("\n");
      const path = join(dir, `${now.replaceAll(":", "-")}-${process.pid}.log`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(path, `${[header, ...entries].join("\n\n")}\n`);
      console.error(`Test failures saved to ${path}`);
    },
  };
}

/**
 * 간헐적으로 실패한 테스트의 이름과 오류가 출력이 잘려도 남게 한다.
 * `test.reporters` 에 넣으면 vitest 의 기본 리포터(터미널·GitHub Actions)를 대신하고 `--reporter`
 * 에는 밀려나므로, 정해진 리포터 뒤에 덧붙인다.
 */
export function failureLogPlugin(dir: string): Vite.Plugin {
  return {
    name: "seedbook:failure-log",
    configureVitest({ vitest }) {
      vitest.config.reporters.push(failureLogReporter(dir));
    },
  };
}
