import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { answer, expect, playRound, test } from "./support";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function clean(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(
    violations.map(
      (v) => `${v.id}: ${v.help}\n  ${v.nodes.map((n) => n.target.join(" ")).join("\n  ")}`,
    ),
  ).toEqual([]);
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme });

    test("home, question, feedback and results have no WCAG A/AA violations", async ({ page }) => {
      await page.goto("/");
      await clean(page);
      await page.getByRole("button", { name: "Play today's challenge" }).click();
      await expect(page.locator("h2#question")).toBeVisible();
      await clean(page);
      await answer(page, false);
      await expect(page.getByTestId("verdict")).toBeVisible();
      await clean(page);
      await page.getByRole("button", { name: "Next question" }).click();
      await playRound(page, [true, true, false, true]);
      await expect(page.getByRole("heading", { name: "Round complete" })).toBeVisible();
      await clean(page);
      await page.getByRole("button", { name: "Back to home" }).click();
      await clean(page);
    });
  });
}
