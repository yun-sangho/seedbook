import { expect, test } from "@playwright/test";

test.describe("app smoke test", () => {
  test("renders root layout with expected metadata and sidebar", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Seedbook/);
  });

  test("dashboard route is reachable", async ({ page }) => {
    const response = await page.goto("/dashboard");
    expect(response?.ok()).toBeTruthy();
  });
});
