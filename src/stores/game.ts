import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { QUESTION_BANK } from "../data/bank";
import { utcDay } from "../engine/days";
import { dueCount } from "../engine/leitner";
import type { Topic } from "../engine/question";
import {
  answer as answerQuestion,
  currentRound,
  dailySet,
  dueQuestions,
  next as nextQuestion,
  pickQuestions,
  type Quiz,
  startQuiz,
  summarise,
  tick as tickQuiz,
} from "../engine/quiz";
import { createRng } from "../engine/random";
import { createLeaderboard, type Leaderboard, type TopScore } from "../lib/leaderboard";
import { liveStreak, type Mode, recordGame } from "../lib/progress";
import { loadPlayerId, loadProgress, saveProgress } from "../lib/storage";

export const PRACTICE_COUNT = 10;

export interface Session {
  readonly mode: Mode;
  readonly day: string;
  readonly quiz: Quiz;
}

export type SubmitState = "idle" | "sending" | "saved" | "already-submitted" | "failed";

export const useGame = defineStore("game", () => {
  const today = ref(utcDay(new Date()));
  const progress = ref(loadProgress());
  const session = ref<Session | null>(null);
  const leaderboard = ref<Leaderboard | null>(null);
  const top = ref<TopScore[] | null>(null);
  const submit = ref<SubmitState>("idle");
  const recorded = ref(false);

  watch(progress, (value) => saveProgress(value), { deep: true });

  const dueToday = computed(() => dueCount(progress.value.deck, today.value));
  const streak = computed(() => liveStreak(progress.value, today.value));
  const dailyDone = computed(() => progress.value.daily[today.value] ?? null);
  const online = computed(() => leaderboard.value !== null);
  const round = computed(() => (session.value ? currentRound(session.value.quiz) : undefined));

  async function connect() {
    leaderboard.value = await createLeaderboard({
      url: import.meta.env.VITE_SUPABASE_URL,
      key: import.meta.env.VITE_SUPABASE_ANON_KEY,
      playerId: loadPlayerId(),
    });
    await refreshTop();
  }

  async function refreshTop() {
    top.value = leaderboard.value ? await leaderboard.value.topDaily(today.value) : null;
  }

  function begin(mode: Mode, topics: readonly Topic[] = []) {
    const day = today.value;
    recorded.value = false;
    submit.value = "idle";
    if (mode === "daily") {
      const { questions, rng } = dailySet(QUESTION_BANK, day);
      session.value = { mode, day, quiz: startQuiz(questions, rng) };
      return;
    }
    const rng = createRng(Date.now() >>> 0);
    const questions =
      mode === "review"
        ? dueQuestions(QUESTION_BANK, progress.value.deck, day, rng, PRACTICE_COUNT)
        : pickQuestions(QUESTION_BANK, progress.value.deck, day, rng, {
            count: PRACTICE_COUNT,
            topics,
          });
    session.value = { mode, day, quiz: startQuiz(questions, rng) };
  }

  function update(change: (quiz: Quiz) => Quiz) {
    if (!session.value) return;
    const quiz = change(session.value.quiz);
    session.value = { ...session.value, quiz };
    if (quiz.phase === "done" && !recorded.value) finish(session.value);
  }

  /** Saves the finished game exactly once. */
  function finish(s: Session) {
    recorded.value = true;
    progress.value = recordGame(progress.value, s.mode, s.day, s.quiz.answers, summarise(s.quiz));
  }

  const answer = (choice: number) => update((q) => answerQuestion(q, choice));
  const tick = (ms: number) => update((q) => tickQuiz(q, ms));
  const advance = () => update(nextQuestion);

  function home() {
    session.value = null;
    today.value = utcDay(new Date());
  }

  function setNickname(name: string) {
    progress.value = { ...progress.value, nickname: name.slice(0, 24) };
  }

  async function submitDaily() {
    const s = session.value;
    const result = s ? progress.value.daily[s.day] : undefined;
    if (s?.mode !== "daily" || !result || !leaderboard.value || submit.value === "sending") return;
    submit.value = "sending";
    submit.value = await leaderboard.value.submitDaily({
      nickname: progress.value.nickname,
      day: s.day,
      points: result.points,
      correct: result.correct,
      total: result.total,
    });
    await refreshTop();
  }

  return {
    today,
    progress,
    session,
    top,
    submit,
    dueToday,
    streak,
    dailyDone,
    online,
    round,
    connect,
    begin,
    answer,
    tick,
    advance,
    home,
    setNickname,
    submitDaily,
  };
});
