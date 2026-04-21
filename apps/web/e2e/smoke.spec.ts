import { expect, test } from "@playwright/test";

test.describe("app smoke test", () => {
  test("renders root layout with expected metadata", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Seedbook/);
  });

  test("dashboard route is reachable", async ({ page }) => {
    const response = await page.goto("/dashboard");
    expect(response?.ok()).toBeTruthy();
  });

  test("unauthenticated users see the login screen instead of app content", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "로그인이 필요합니다" })).toBeVisible();
    await expect(page.getByRole("button", { name: "카카오로 로그인" })).toBeVisible();
  });
});
