<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from "vue";
import { TOPIC_LABEL } from "../engine/question";
import { TIME_LIMIT_MS } from "../engine/quiz";
import { useGame } from "../stores/game";

const game = useGame();

const quiz = computed(() => game.session?.quiz);
const round = computed(() => game.round);
const answered = computed(() => quiz.value?.phase === "feedback");
const last = computed(() =>
  quiz.value ? quiz.value.index + 1 >= quiz.value.rounds.length : false,
);
const lastAnswer = computed(() => quiz.value?.answers[quiz.value.answers.length - 1]);
const seconds = computed(() => Math.ceil((quiz.value?.remainingMs ?? 0) / 1000));
const low = computed(() => (quiz.value?.remainingMs ?? 0) <= 5000);

const announcement = computed(() => {
  const a = lastAnswer.value;
  const r = round.value;
  if (!answered.value || !a || !r) return "";
  if (a.choice === null) return `Time is up. The answer was ${r.question.correct}.`;
  return a.correct
    ? `Correct. ${a.points} points.`
    : `Not quite. The answer was ${r.question.correct}.`;
});

// Time is measured in short ticks, and one tick never counts for more than 250 ms, so a
// tab that was in the background does not burn the player's time.
const MAX_TICK_MS = 250;
let timer: ReturnType<typeof setInterval> | undefined;
let last_ = performance.now();

function onTick() {
  const now = performance.now();
  game.tick(Math.min(now - last_, MAX_TICK_MS));
  last_ = now;
}

function onKey(event: KeyboardEvent) {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (!answered.value) {
    const index = Number(event.key) - 1;
    if (Number.isInteger(index) && index >= 0 && index < 4) game.answer(index);
  } else if (event.key === "Enter") {
    event.preventDefault();
    game.advance();
  }
}

onMounted(() => {
  last_ = performance.now();
  timer = setInterval(onTick, 100);
  window.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => {
  clearInterval(timer);
  window.removeEventListener("keydown", onKey);
});

function stateOf(index: number): "correct" | "wrong" | "idle" {
  const r = round.value;
  if (!answered.value || !r) return "idle";
  if (r.choices[index] === r.question.correct) return "correct";
  return lastAnswer.value?.choice === index ? "wrong" : "idle";
}
</script>

<template>
  <section v-if="quiz && round" class="rise-in flex flex-col gap-4" aria-labelledby="question">
    <div class="flex items-center justify-between text-sm text-muted">
      <span data-testid="progress">Question {{ quiz.index + 1 }} of {{ quiz.rounds.length }}</span>
      <span>{{ TOPIC_LABEL[round.question.topic] }} · {{ "★".repeat(round.question.difficulty) }}</span>
    </div>

    <div class="flex items-center gap-3">
      <progress
        class="timer"
        aria-label="Time left"
        :max="TIME_LIMIT_MS"
        :value="quiz.remainingMs"
        :data-low="low"
      />
      <span class="w-10 text-right tabular-nums font-semibold" aria-hidden="true" data-testid="seconds">{{ seconds }}</span>
    </div>

    <h2 id="question" class="text-2xl font-semibold leading-snug">{{ round.question.prompt }}</h2>

    <ul class="flex flex-col gap-3">
      <li v-for="(choice, i) in round.choices" :key="choice">
        <button
          type="button"
          class="flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left text-lg transition-colors disabled:cursor-default"
          :class="{
            'border-line bg-surface hover:bg-surface-strong': stateOf(i) === 'idle',
            'border-good bg-good/15': stateOf(i) === 'correct',
            'border-bad bg-bad/15': stateOf(i) === 'wrong',
          }"
          :disabled="answered"
          @click="game.answer(i)"
        >
          <span class="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border border-line text-sm" aria-hidden="true">{{ i + 1 }}</span>
          <span class="flex-1">{{ choice }}</span>
          <span v-if="stateOf(i) === 'correct'" class="text-sm font-semibold text-good">Correct</span>
          <span v-else-if="stateOf(i) === 'wrong'" class="text-sm font-semibold text-bad">Your answer</span>
        </button>
      </li>
    </ul>

    <div v-if="answered" class="rise-in rounded-2xl border border-line bg-surface p-4">
      <p class="font-semibold" data-testid="verdict">
        <template v-if="lastAnswer?.choice === null">⏰ Time's up</template>
        <template v-else-if="lastAnswer?.correct">✅ Correct, +{{ lastAnswer.points }} points</template>
        <template v-else>❌ Not quite</template>
      </p>
      <p class="mt-1 text-muted">{{ round.question.explanation }}</p>
      <button
        type="button"
        class="mt-4 w-full rounded-2xl bg-accent px-4 py-3 text-lg font-semibold text-accent-ink"
        @click="game.advance()"
      >
        {{ last ? "See results" : "Next question" }}
      </button>
    </div>

    <p class="sr-only" aria-live="polite">{{ announcement }}</p>
  </section>
</template>
