import { devices, expect, test } from "@playwright/test";

test.describe("app smoke test", () => {
  test("renders root layout with expected metadata", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Seedbook/);
  });

  test("desktop visitors of an app page land on the introduction page", async ({ page }) => {
    const response = await page.goto("/home");
    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText("이 브라우저에서 모바일 화면으로 열기")).toBeVisible();
  });

  test.describe("on a phone", () => {
    test.use({
      userAgent: devices["iPhone 15"].userAgent,
      viewport: devices["iPhone 15"].viewport,
    });

    test("unauthenticated users see the login screen instead of app content", async ({ page }) => {
      await page.goto("/home");
      await expect(page.getByRole("heading", { name: "Seedbook 로그인" })).toBeVisible();
      await expect(page.getByRole("button", { name: "카카오로 로그인" })).toBeVisible();
    });

    test("moves an old /assets address to the new path, keeping the query", async ({ page }) => {
      await page.goto("/assets/investments?signedInWith=kakao");
      await expect(page).toHaveURL(/\/accounts\?signedInWith=kakao$/);
    });
  });
});
