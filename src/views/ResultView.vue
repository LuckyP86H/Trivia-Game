<script setup lang="ts">
import { computed, ref } from "vue";
import { summarise } from "../engine/quiz";
import { shareText } from "../lib/clipboard";
import { buildShareText, dayNumber } from "../lib/share";
import { useGame } from "../stores/game";

const game = useGame();
const message = ref("");

const session = computed(() => game.session);
const summary = computed(() => (session.value ? summarise(session.value.quiz) : null));
const daily = computed(() =>
  session.value?.mode === "daily" ? game.progress.daily[session.value.day] : undefined,
);
const nickname = computed({
  get: () => game.progress.nickname,
  set: (value: string) => game.setNickname(value),
});
const canSubmit = computed(
  () => game.online && daily.value && game.progress.nickname.trim().length > 0,
);

async function share() {
  if (!session.value || !daily.value) return;
  const text = buildShareText(session.value.day, daily.value, `${window.location.origin}/`);
  message.value =
    (await shareText(text)) === "failed" ? "Couldn't copy. Select the text instead." : "Copied!";
}

const SUBMIT_TEXT = {
  idle: "",
  sending: "Sending…",
  saved: "Score posted to today's leaderboard.",
  "already-submitted": "You already posted a score today.",
  failed: "Couldn't reach the leaderboard. Try again.",
} as const;
</script>

<template>
  <section v-if="session && summary" class="rise-in flex flex-col gap-4" aria-labelledby="result-title">
    <div class="rounded-3xl border border-line bg-surface p-5">
      <h2 id="result-title" class="text-2xl font-semibold">
        {{ summary.correct === summary.total ? "Perfect round! 🎉" : "Round complete" }}
      </h2>
      <p class="mt-2 text-4xl font-semibold tabular-nums" data-testid="score">{{ summary.points }} points</p>
      <dl class="mt-4 grid grid-cols-4 gap-2 text-center">
        <div class="rounded-2xl border border-line px-1 py-3"><dt class="text-xs text-muted">Correct</dt><dd class="text-xl font-semibold" data-testid="correct">{{ summary.correct }}</dd></div>
        <div class="rounded-2xl border border-line px-1 py-3"><dt class="text-xs text-muted">Wrong</dt><dd class="text-xl font-semibold">{{ summary.wrong }}</dd></div>
        <div class="rounded-2xl border border-line px-1 py-3"><dt class="text-xs text-muted">Timed out</dt><dd class="text-xl font-semibold">{{ summary.unanswered }}</dd></div>
        <div class="rounded-2xl border border-line px-1 py-3"><dt class="text-xs text-muted">Best streak</dt><dd class="text-xl font-semibold">{{ summary.bestStreak }}</dd></div>
      </dl>
      <p v-if="session.mode !== 'daily'" class="mt-3 text-sm text-muted">
        Missed questions will come back in Review sooner than the ones you got right.
      </p>
    </div>

    <div v-if="daily" class="rounded-3xl border border-line bg-surface p-5">
      <p class="text-lg font-semibold">Daily #{{ dayNumber(session.day) }}</p>
      <div class="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" class="rounded-2xl bg-accent px-5 py-3 text-lg font-semibold text-accent-ink" @click="share">Share result</button>
        <output class="text-sm text-muted" aria-live="polite">{{ message }}</output>
      </div>

      <form v-if="game.online" class="mt-5 flex flex-col gap-3" @submit.prevent="game.submitDaily()">
        <label class="text-sm font-medium" for="nickname">Post your score to the leaderboard</label>
        <div class="flex gap-3">
          <input
            id="nickname"
            v-model="nickname"
            maxlength="24"
            autocomplete="nickname"
            placeholder="Nickname"
            class="min-w-0 flex-1 rounded-2xl border border-line bg-surface-strong px-4 py-3 text-lg"
          />
          <button
            type="submit"
            class="rounded-2xl border border-line px-5 py-3 font-semibold disabled:opacity-50"
            :disabled="!canSubmit || game.submit === 'sending' || game.submit === 'saved'"
          >
            Post
          </button>
        </div>
        <p class="text-sm text-muted" aria-live="polite">{{ SUBMIT_TEXT[game.submit] }}</p>
      </form>
    </div>

    <div class="rounded-3xl border border-line bg-surface p-5">
      <h3 class="text-lg font-semibold">Review</h3>
      <ol class="mt-3 space-y-4">
        <li v-for="(a, i) in session.quiz.answers" :key="a.questionId">
          <p class="font-medium">
            <span aria-hidden="true">{{ a.choice === null ? "⏰" : a.correct ? "✅" : "❌" }}</span>
            <span class="sr-only">{{ a.choice === null ? "Timed out." : a.correct ? "Correct." : "Wrong." }}</span>
            {{ session.quiz.rounds[i]?.question.prompt }}
          </p>
          <p class="mt-1 text-sm text-muted">
            Answer: <span class="text-ink">{{ session.quiz.rounds[i]?.question.correct }}</span>
          </p>
        </li>
      </ol>
    </div>

    <button type="button" class="rounded-2xl bg-accent px-4 py-3 text-lg font-semibold text-accent-ink" @click="game.home()">
      Back to home
    </button>
  </section>
</template>
