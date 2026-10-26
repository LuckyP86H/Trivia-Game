import { z } from "zod";

export const TOPICS = [
  "python",
  "queues",
  "search",
  "aws",
  "redis",
  "snowflake",
  "sql",
  "stats-ml",
  "ai",
] as const;

export type Topic = (typeof TOPICS)[number];

export const TOPIC_LABEL: Readonly<Record<Topic, string>> = {
  python: "Python",
  queues: "Queues and streams",
  search: "Search",
  aws: "AWS",
  redis: "Redis",
  snowflake: "Snowflake",
  sql: "SQL",
  "stats-ml": "Stats and ML",
  ai: "LLMs and agents",
};

/** One correct answer and three distractors; the order is shuffled when a game starts. */
export const questionSchema = z.strictObject({
  id: z.string().regex(/^[a-z-]+-\d+$/),
  topic: z.enum(TOPICS),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  prompt: z.string().min(10).max(300),
  correct: z.string().min(1).max(160),
  wrong: z.tuple([
    z.string().min(1).max(160),
    z.string().min(1).max(160),
    z.string().min(1).max(160),
  ]),
  explanation: z.string().min(10).max(400),
});

export type Question = z.infer<typeof questionSchema>;

/** The checks a hand-written question bank must pass; used by tests and by anything that imports AI output. */
export function validateBank(questions: readonly Question[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const prompts = new Set<string>();
  for (const q of questions) {
    if (ids.has(q.id)) problems.push(`${q.id}: duplicate id`);
    ids.add(q.id);
    const prompt = q.prompt.toLowerCase();
    if (prompts.has(prompt)) problems.push(`${q.id}: duplicate prompt`);
    prompts.add(prompt);
    const options = [q.correct, ...q.wrong].map((text) => text.trim().toLowerCase());
    if (new Set(options).size !== 4) problems.push(`${q.id}: the four answers must differ`);
    if (!q.id.startsWith(`${q.topic}-`)) problems.push(`${q.id}: id should start with its topic`);
  }
  return problems;
}
