/** SEED 가 아닌 전체 화면(앱 잠금)은 이 속성을 직접 단다. */
export const COVER_ATTRIBUTE = "data-covers-tab-bar";
export const COVER_SELECTOR = `[${COVER_ATTRIBUTE}]`;
/** SEED 시트·다이얼로그는 열려 있는 동안만 `data-open` 을 단다. */
const OPEN_DIALOG_SELECTOR = `[role="dialog"][data-open], [role="alertdialog"][data-open]`;

export function isOverlayOpen(): boolean {
  return document.querySelector(`${OPEN_DIALOG_SELECTOR}, ${COVER_SELECTOR}`) !== null;
}
