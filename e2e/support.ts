import { test as base, expect, type Page } from "@playwright/test";
import { QUESTION_BANK } from "../src/data/bank";
import { utcDay } from "../src/engine/days";
import { dailySet } from "../src/engine/quiz";

/** Every test fails if the page logs a console error or warning, or throws. */
export const test = base.extend({
  page: async ({ page }, use) => {
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning")
        problems.push(`console.${m.type()}: ${m.text()}`);
    });
    await use(page);
    expect(problems, "the browser console should stay clean").toEqual([]);
  },
});

export { expect };

export const today = () => utcDay(new Date());
export const todaysQuestions = () => dailySet(QUESTION_BANK, today()).questions;

const byPrompt = new Map(QUESTION_BANK.map((q) => [q.prompt, q]));

/** The bank entry for the question currently on screen. */
export async function currentQuestion(page: Page) {
  const prompt = (await page.locator("h2#question").textContent())?.trim() ?? "";
  const question = byPrompt.get(prompt);
  if (!question) throw new Error(`Question not in the bank: ${prompt}`);
  return question;
}

export async function answer(page: Page, right: boolean) {
  const q = await currentQuestion(page);
  const text = right ? q.correct : q.wrong[0];
  await page
    .getByRole("button", { name: text, exact: false })
    .filter({ hasText: text })
    .first()
    .click();
}

export async function playRound(page: Page, rights: readonly boolean[]) {
  for (const [i, right] of rights.entries()) {
    await answer(page, right);
    await expect(page.getByTestId("verdict")).toBeVisible();
    await page
      .getByRole("button", { name: i === rights.length - 1 ? "See results" : "Next question" })
      .click();
  }
}
