<script setup lang="ts">
import { onMounted } from "vue";
import { useGame } from "./stores/game";
import HomeView from "./views/HomeView.vue";
import QuizView from "./views/QuizView.vue";
import ResultView from "./views/ResultView.vue";

const game = useGame();
onMounted(() => void game.connect());
</script>

<template>
  <div class="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-5 px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
    <header class="flex items-center justify-between gap-3">
      <h1 class="text-2xl font-semibold tracking-tight">🧠 Stack Quiz</h1>
      <button
        v-if="game.session"
        type="button"
        class="rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium"
        @click="game.home()"
      >
        Quit
      </button>
    </header>

    <main class="flex flex-1 flex-col gap-5">
      <HomeView v-if="!game.session" />
      <QuizView v-else-if="game.session.quiz.phase !== 'done'" />
      <ResultView v-else />
    </main>

    <footer class="pt-4 text-center text-sm text-muted">
      Rebuilt in 2026 from a 2019 bootcamp project ·
      <a class="underline" href="https://github.com/LuckyP86H/Trivia-Game" target="_blank" rel="noreferrer">Source</a>
    </footer>
  </div>
</template>
