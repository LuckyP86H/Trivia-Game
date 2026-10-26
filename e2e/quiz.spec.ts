import { dayNumber } from "../src/lib/share";
import {
  answer,
  currentQuestion,
  expect,
  playRound,
  test,
  today,
  todaysQuestions,
} from "./support";

test.describe("daily challenge", () => {
  test("shows the home screen with an empty record", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Stack Quiz/);
    await expect(page.getByText(`Daily challenge #${dayNumber(today())}`)).toBeVisible();
    await expect(page.getByTestId("streak")).toHaveText("0");
    await expect(page.getByRole("button", { name: /Review due \(0\)/ })).toBeDisabled();
  });

  test("deals the same five questions as the engine for today", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Play today's challenge" }).click();
    for (const expected of todaysQuestions()) {
      await expect(page.locator("h2#question")).toHaveText(expected.prompt);
      await answer(page, true);
      await page.getByRole("button", { name: /Next question|See results/ }).click();
    }
  });

  test("a perfect game scores, records the day and starts a streak", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Play today's challenge" }).click();
    await playRound(page, [true, true, true, true, true]);

    await expect(page.getByRole("heading", { name: "Perfect round!" })).toBeVisible();
    await expect(page.getByTestId("correct")).toHaveText("5");
    await expect(page.getByTestId("score")).toContainText(/[5-9]\d\d|1\d{3} points/);

    await page.getByRole("button", { name: "Back to home" }).click();
    await expect(page.getByTestId("daily-result")).toContainText("5/5 correct");
    await expect(page.getByTestId("streak")).toHaveText("1");
    await expect(page.getByRole("button", { name: "Play today's challenge" })).toBeHidden();
  });

  test("remembers the finished day after a reload", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Play today's challenge" }).click();
    await playRound(page, [true, false, true, false, true]);
    await page.getByRole("button", { name: "Back to home" }).click();
    await page.reload();
    await expect(page.getByTestId("daily-result")).toContainText("3/5 correct");
  });

  test("copies a share text with one square per question", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.addInitScript(() =>
      Object.defineProperty(navigator, "share", { value: undefined, configurable: true }),
    );
    await page.goto("/");
    await page.getByRole("button", { name: "Play today's challenge" }).click();
    await playRound(page, [true, false, true, true, true]);
    await page.getByRole("button", { name: "Share result" }).click();
    await expect(page.getByText("Copied!").first()).toBeVisible();
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain(`Stack Quiz #${dayNumber(today())}`);
    expect(text).toContain("4/5");
    expect(text).toContain("🟩🟥🟩🟩🟩");
  });
});

test.describe("the timer", () => {
  test("moves on when time runs out instead of freezing (the 2019 bug)", async ({ page }) => {
    await page.clock.install();
    await page.goto("/");
    await page.getByRole("button", { name: "Play today's challenge" }).click();
    await expect(page.getByTestId("seconds")).toHaveText("20");

    await page.clock.runFor(21_000);
    await expect(page.getByTestId("verdict")).toContainText("Time's up");
    await page.getByRole("button", { name: "Next question" }).click();
    await expect(page.getByTestId("progress")).toHaveText("Question 2 of 5");
    await expect(page.getByTestId("seconds")).toHaveText("20");
  });

  test("a tab hidden for a long time does not burn the player's time", async ({ page }) => {
    await page.clock.install();
    await page.goto("/");
    await page.getByRole("button", { name: "Play today's challenge" }).click();
    await page.clock.runFor(1_000);
    // One 30-second jump (a throttled background tab) must cost at most one short tick.
    await page.clock.fastForward(30_000);
    await expect(page.getByTestId("verdict")).toBeHidden();
    expect(Number(await page.getByTestId("seconds").textContent())).toBeGreaterThan(15);
  });
});

test.describe("practice and spaced repetition", () => {
  test("misses come back in Review, and answering them correctly clears them", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "SQL" }).click();
    await page.getByRole("button", { name: "Start practice" }).click();
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      seen.push((await currentQuestion(page)).id);
      await answer(page, false);
      await page.getByRole("button", { name: /Next question|See results/ }).click();
    }
    await expect(page.getByRole("heading", { name: "Round complete" })).toBeVisible();
    await page.getByRole("button", { name: "Back to home" }).click();

    await expect(page.getByRole("button", { name: "Review due (4)" })).toBeEnabled();
    await page.getByRole("button", { name: "Review due (4)" }).click();
    for (let i = 0; i < 4; i++) {
      expect(seen).toContain((await currentQuestion(page)).id);
      await answer(page, true);
      await page.getByRole("button", { name: /Next question|See results/ }).click();
    }
    await page.getByRole("button", { name: "Back to home" }).click();
    await expect(page.getByRole("button", { name: /Review due \(0\)/ })).toBeDisabled();
    await expect(page.getByTestId("mastery")).not.toHaveText("0%");
  });

  test("answers with the number keys and continues with Enter", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Start practice" }).click();
    await page.keyboard.press("2");
    await expect(page.getByTestId("verdict")).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("progress")).toHaveText("Question 2 of 10");
  });
});

test("fits a 320px screen without sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  const overflow = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.getByRole("button", { name: "Play today's challenge" }).click();
  await answer(page, true);
  expect(await overflow()).toBeLessThanOrEqual(0);
});
