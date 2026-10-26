<script setup lang="ts">
import { computed, ref } from "vue";
import { QUESTION_BANK } from "../data/bank";
import { mastery } from "../engine/leitner";
import { TOPIC_LABEL, TOPICS, type Topic } from "../engine/question";
import { shareText } from "../lib/clipboard";
import { buildShareText, dayNumber } from "../lib/share";
import { PRACTICE_COUNT, useGame } from "../stores/game";

const game = useGame();
const picked = ref<Topic[]>([]);
const message = ref("");

const masteryPercent = computed(() => mastery(game.progress.deck, QUESTION_BANK.length));

function toggle(topic: Topic) {
  picked.value = picked.value.includes(topic)
    ? picked.value.filter((t) => t !== topic)
    : [...picked.value, topic];
}

async function share() {
  const result = game.dailyDone;
  if (!result) return;
  const outcome = await shareText(buildShareText(game.today, result, `${window.location.origin}/`));
  message.value = outcome === "failed" ? "Couldn't copy. Select the text instead." : "Copied!";
}
</script>

<template>
  <section class="rise-in rounded-3xl border border-line bg-surface p-5" aria-labelledby="daily-title">
    <p class="text-sm font-medium text-muted">Daily challenge #{{ dayNumber(game.today) }} · same five questions for everyone</p>
    <h2 id="daily-title" class="mt-1 text-2xl font-semibold">
      {{ game.dailyDone ? "Done for today 🎉" : "Five questions, twenty seconds each" }}
    </h2>

    <template v-if="game.dailyDone">
      <p class="mt-3 text-lg" data-testid="daily-result">
        {{ game.dailyDone.correct }}/{{ game.dailyDone.total }} correct · {{ game.dailyDone.points }} points
      </p>
      <p class="mt-1 text-sm text-muted">A new challenge starts at 00:00 UTC.</p>
      <div class="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" class="rounded-2xl bg-accent px-5 py-3 text-lg font-semibold text-accent-ink" @click="share">
          Share result
        </button>
        <output class="text-sm text-muted" aria-live="polite">{{ message }}</output>
      </div>
    </template>
    <button
      v-else
      type="button"
      class="mt-4 w-full rounded-2xl bg-accent px-5 py-3 text-lg font-semibold text-accent-ink"
      @click="game.begin('daily')"
    >
      Play today's challenge
    </button>

    <dl class="mt-5 grid grid-cols-3 gap-3 text-center">
      <div class="rounded-2xl border border-line px-2 py-3">
        <dt class="text-xs text-muted">Streak</dt>
        <dd data-testid="streak" class="text-2xl font-semibold">{{ game.streak }}</dd>
      </div>
      <div class="rounded-2xl border border-line px-2 py-3">
        <dt class="text-xs text-muted">Best streak</dt>
        <dd class="text-2xl font-semibold">{{ game.progress.bestStreak }}</dd>
      </div>
      <div class="rounded-2xl border border-line px-2 py-3">
        <dt class="text-xs text-muted">Games</dt>
        <dd class="text-2xl font-semibold">{{ game.progress.played }}</dd>
      </div>
    </dl>
  </section>

  <section v-if="game.top" class="rounded-3xl border border-line bg-surface p-5" aria-labelledby="top-title">
    <h2 id="top-title" class="text-xl font-semibold">Today's top scores</h2>
    <p v-if="game.top.length === 0" class="mt-2 text-muted">Nobody has played yet. Be the first.</p>
    <ol v-else class="mt-3 space-y-1">
      <li v-for="(row, i) in game.top" :key="`${row.nickname}-${i}`" class="flex justify-between gap-3">
        <span>{{ i + 1 }}. {{ row.nickname }}</span>
        <span class="tabular-nums text-muted">{{ row.points }} pts · {{ row.correct }}/{{ row.total }}</span>
      </li>
    </ol>
  </section>

  <section class="rounded-3xl border border-line bg-surface p-5" aria-labelledby="practice-title">
    <h2 id="practice-title" class="text-xl font-semibold">Practice</h2>
    <p class="mt-1 text-sm text-muted">{{ PRACTICE_COUNT }} questions. Choose topics, or none for a mix.</p>
    <ul class="mt-3 flex flex-wrap gap-2">
      <li v-for="topic in TOPICS" :key="topic">
        <button
          type="button"
          :aria-pressed="picked.includes(topic)"
          class="rounded-full border border-line px-3 py-1.5 text-sm aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-accent-ink"
          @click="toggle(topic)"
        >
          {{ TOPIC_LABEL[topic] }}
        </button>
      </li>
    </ul>
    <div class="mt-4 grid grid-cols-2 gap-3">
      <button type="button" class="rounded-2xl bg-accent px-4 py-3 font-semibold text-accent-ink" @click="game.begin('practice', picked)">
        Start practice
      </button>
      <button
        type="button"
        class="rounded-2xl border border-line px-4 py-3 font-semibold disabled:opacity-50"
        :disabled="game.dueToday === 0"
        @click="game.begin('review')"
      >
        Review due ({{ game.dueToday }})
      </button>
    </div>
    <p class="mt-4 text-sm text-muted">
      Questions you miss come back sooner (Leitner boxes). Mastery:
      <strong class="text-ink" data-testid="mastery">{{ masteryPercent }}%</strong>
    </p>
  </section>
</template>
