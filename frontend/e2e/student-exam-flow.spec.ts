import { expect, test, type Page } from '@playwright/test';

/**
 * E2E safety net for the core student loop against a REAL backend:
 *
 *   sign in (Demo Student, no PIN) → home → "Take an exam" → choose 5 questions
 *   → start → answer every question → submit → result page shows "Passed".
 *
 * Requires the seeded demo data (`go run ./cmd/seed`): "Demo Mathematics" with
 * 25 "What is a + b?" questions whose option order is shuffled per attempt, so
 * the test computes the sum and picks the matching option. Answering correctly
 * matters — a failed attempt puts the demo student into a post-fail cooldown
 * that would block the next run. Run via `make e2e` (see scripts/e2e.sh).
 */

const SIGN_IN_URL = '/studyrover/student/signin';

async function answerCurrentQuestion(page: Page): Promise<void> {
  const prompt = page.getByText(/What is \d+ \+ \d+\?/).first();
  await expect(prompt).toBeVisible();
  const match = /(\d+)\s*\+\s*(\d+)/.exec((await prompt.textContent()) ?? '');
  if (!match) throw new Error('could not parse demo question text');
  const sum = String(Number(match[1]) + Number(match[2]));

  const options = page.getByRole('radiogroup', { name: 'Answer options' });
  const answer = options.getByRole('radio', { name: sum, exact: true });
  await expect(answer, `option "${sum}" should be offered`).toHaveCount(1);
  await answer.click();
  await expect(answer).toHaveAttribute('aria-checked', 'true');
}

test('student can sign in, take an exam, and pass', async ({ page }) => {
  // Sign in as the PIN-less demo student.
  await page.goto(SIGN_IN_URL);
  await page.getByRole('button', { name: /Demo Student/ }).click();
  await expect(page).toHaveURL(/\/studyrover\/student\/?$/);

  // Home → expand the demo subject card → its exam → start screen.
  await page
    .getByRole('list', { name: 'Subjects' })
    .getByRole('button', { name: /Demo Mathematics/ })
    .click();
  await page.getByRole('button', { name: 'Take an exam' }).first().click();
  await expect(page).toHaveURL(/\/student\/exams\/[^/]+\/start$/);
  await page.getByRole('button', { name: 'Start exam' }).click();
  await expect(page).toHaveURL(/\/student\/attempts\/[^/]+$/);

  // Answer every question, advancing with Next; the last one exposes Submit.
  // The attempt size comes from the exam template (the start screen's size
  // picker is not sent to the server), so loop until Submit appears.
  const submit = page.getByRole('button', { name: 'Submit exam', exact: true });
  const next = page.getByRole('button', { name: 'Next', exact: true });
  const MAX_QUESTIONS = 50;
  let answered = 0;
  for (; answered < MAX_QUESTIONS; answered++) {
    await answerCurrentQuestion(page);
    if (await submit.isVisible()) break;
    await next.click();
  }
  expect(answered, 'exam should end within the question cap').toBeLessThan(MAX_QUESTIONS);
  await submit.click();
  const dialog = page.getByRole('alertdialog', { name: 'Submit exam?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Submit', exact: true }).click();

  // Result page: every answer was correct, so the attempt passes at 100%.
  await expect(page).toHaveURL(/\/student\/attempts\/[^/]+\/result$/);
  await expect(page.getByText('Passed', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Score 100 percent').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review answers' })).toBeVisible();

  // Guardian (fake wall, seeded gated device): the pass should open internet
  // time — 20 questions × 3 min = 60 min — within a few seconds of submit.
  await expect(
    page.getByText(/You earned 60 minutes of internet/),
  ).toBeVisible({ timeout: 20_000 });

  // …and the student home shows the live "Online" strip.
  await page.getByRole('button', { name: /home/i }).click();
  await expect(page).toHaveURL(/\/studyrover\/student\/?$/);
  await expect(page.getByText('Online', { exact: true })).toBeVisible();
  await expect(page.getByText('left', { exact: true })).toBeVisible();
});
