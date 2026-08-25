export type BenchSendBackReason = 'not_ready' | 'question' | 'grades';

export const BENCH_SEND_BACK = [
  {
    id: 'not_ready' as const,
    label: 'Not Ready',
    noteRequired: false,
    markProcessing: false,
    hint: 'It goes back to the queue. No note needed.',
  },
  {
    id: 'question' as const,
    label: 'Question for Processing',
    noteRequired: true,
    markProcessing: true,
    hint: 'Write the question. Processing will see it on their TO desk.',
  },
  {
    id: 'grades' as const,
    label: "Don't agree with Grades/Values",
    noteRequired: true,
    markProcessing: true,
    hint: 'Say what is wrong. Processing will see the grades and your note.',
  },
];

export function benchSendBackReady(reason: BenchSendBackReason | null, note: string): boolean {
  if (reason == null) return false;
  const entry = BENCH_SEND_BACK.find((item) => item.id === reason);
  if (!entry) return false;
  return !entry.noteRequired || note.trim() !== '';
}
