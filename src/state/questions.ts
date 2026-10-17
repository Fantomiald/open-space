// Answers to an AskUserQuestion call, as Claude Code expects them. Pure function.
import type { Question } from '../../shared/protocol.ts';

/**
 * question text -> answer. Several labels are joined with ", " (the format documented for multiSelect).
 * The user's own text ("Autre") replaces the choice of a single-choice question and is added to a multiple-choice one.
 * Unanswered questions are left out.
 */
export function questionAnswers(questions: readonly Question[], chosen: Readonly<Record<string, readonly string[]>>, other: Readonly<Record<string, string>>): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const { question, multiSelect } of questions) {
    const own = (other[question] ?? '').trim();
    const labels = chosen[question] ?? [];
    const parts = multiSelect ? [...labels, ...(own ? [own] : [])] : own ? [own] : labels.slice(0, 1);
    if (parts.length) answers[question] = parts.join(', ');
  }
  return answers;
}
