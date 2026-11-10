/**
 * 매매 입력 페이지에서 방금 완료한 매매 id. 리밸런싱 화면으로 돌아오면 그 매매가 "남은 매매" 에서
 * 접히며 빠지는 모습을 보여주려고 잠깐 들고 있는다 (화면 사이 일회성 신호라 store 에 두지 않는다).
 */
const pending = new Set<string>();

export function markJustCompleted(taskId: string): void {
  pending.add(taskId);
}

/** 아직 보여주지 않은 방금 완료한 매매인가 — 렌더 중에 읽어 완료 그룹으로 바로 옮기지 않게 한다. */
export function isJustCompleted(taskId: string): boolean {
  return pending.has(taskId);
}

/** 방금 완료한 매매를 꺼내고 비운다 — 빠지는 애니메이션을 시작할 때 한 번 부른다. */
export function takeJustCompleted(): string[] {
  const ids = [...pending];
  pending.clear();
  return ids;
}
