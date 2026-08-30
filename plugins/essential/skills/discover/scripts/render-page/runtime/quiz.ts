/** one quiz question, paired with the card it is asked inside. */
interface Asked {
  /** the options container, which carries the answer key and the link target */
  quiz: HTMLElement;
  /** the question card, which carries the citation code and the label */
  field: HTMLElement;
}

/** where a merge stands, once every question has been read. */
type Verdict = "cleared" | "blocked" | "open";

/**
 * reads the answer a quiz question currently holds
 * @param quiz the question's options container
 * @returns the checked option, or null while the question is unanswered
 */
function answerOf(quiz: HTMLElement): HTMLInputElement | null {
  return quiz.querySelector<HTMLInputElement>("input:checked");
}

/**
 * writes one link back to the section a missed question is explained by.
 *
 * a real anchor, for the same reason the drawer's rows are: the jump keeps
 * every affordance a link has, and it still works on a page whose script has
 * booted far enough to draw this list and no further.
 * @param asked the question the reader got wrong
 * @returns the row
 */
function missRow({ quiz, field }: Asked): HTMLElement {
  const row = document.createElement("li");
  row.className = "gate-miss";
  const target = quiz.dataset.quizExplains ?? "";
  const section = document.querySelector<HTMLElement>(
    `[data-section-id="${target}"]`,
  );

  const jump = document.createElement("a");
  jump.setAttribute("href", `#s-${target}`);
  // the citation code, because it is what a reader cites the question by, and
  // the section's own label, because "re-read section 4" is an instruction and
  // "re-read How the answer is stored" is a place to go
  jump.textContent = `${field.dataset.questionRef ?? ""} · ${field.dataset.questionLabel ?? ""} — re-read ${section?.dataset.sectionLabel ?? target}`;
  row.append(jump);

  return row;
}

/**
 * says where the merge stands and how the progress line should read it
 * @param asked every quiz question on the page
 * @param answered the ones the reader has answered
 * @param missed the answered ones that are wrong
 * @returns the verdict, and the sentence the gate reports it with
 */
function verdictOf(
  asked: Asked[],
  answered: Asked[],
  missed: Asked[],
): [Verdict, string] {
  if (missed.length)
    return [
      "blocked",
      `${missed.length} of ${asked.length} answered wrongly — the sections below say why.`,
    ];

  if (answered.length === asked.length && asked.length)
    return ["cleared", `All ${asked.length} answered correctly.`];

  return [
    "open",
    `${answered.length} of ${asked.length} answered so far.`,
  ];
}

/**
 * scores every quiz question on the page into the merge gate.
 *
 * the scoring is deliberately not the disposition machinery: that machinery
 * asks how an answer stands against what the page recommended, and a quiz
 * recommends nothing — it checks whether the reader read the board. Running it
 * through `data-recommended` would report a wrong answer as a disagreement and
 * print the answer they missed into the reply they send back, which is the one
 * thing a quiz must not do.
 * @returns a repaint, or nothing at all on a board that holds no gate
 */
export function installQuiz(): (() => void) | undefined {
  const gates = [...document.querySelectorAll<HTMLElement>("[data-gate]")];
  if (!gates.length) return undefined;

  const asked = [...document.querySelectorAll<HTMLElement>("[data-quiz]")].flatMap(
    (quiz) => {
      const field = quiz.closest<HTMLElement>("[data-question]");

      return field ? [{ quiz, field }] : [];
    },
  );

  return function paint(): void {
    const answered = asked.filter(({ quiz }) => answerOf(quiz));
    const missed = answered.filter(
      ({ quiz }) => !answerOf(quiz)?.hasAttribute("data-correct"),
    );
    const [verdict, progress] = verdictOf(asked, answered, missed);

    for (const gate of gates) {
      gate.dataset.gateState = verdict;
      const line = gate.querySelector<HTMLElement>("[data-gate-progress]");
      // rewriting an identical live region re-announces it on every keystroke
      if (line && line.textContent !== progress) line.textContent = progress;

      const pass = gate.querySelector<HTMLElement>("[data-gate-pass]");
      if (pass) pass.hidden = verdict !== "cleared";
      const fail = gate.querySelector<HTMLElement>("[data-gate-fail]");
      if (fail) fail.hidden = verdict === "cleared";

      // only the questions answered wrongly: an unanswered one is not a miss,
      // and listing it here would tell a reader they got wrong something they
      // have not yet said anything about
      gate
        .querySelector<HTMLElement>("[data-gate-misses]")
        ?.replaceChildren(...missed.map(missRow));
    }
  };
}
