/**
 * What's new in Halo+, for students (George, 2026-10-23): the real improvements from LOOP_LOG.md in plain words,
 * newest first, a week at a time. Served at /updates/ (src/help/pages.ts). Add to the top when something ships.
 */
export interface UpdateWeek {
  /** The Monday the week starts, YYYY-MM-DD. */
  week: string;
  items: string[];
}

export const UPDATES: UpdateWeek[] = [
  {
    week: '2026-10-19',
    items: [
      'Halo+ now shows up right on Halo. A small pill in the corner says what’s next, and when you open Halo each day it shows the one thing to do first.',
      'Under each class on Halo’s home page, one line says what’s due this week and whether an announcement added something.',
      'On an assignment in Halo, Halo+ shows what your professor added in announcements.',
      'Back after a few days? Now opens with what changed while you were away, and where to start.',
      'Participation posts no longer make anything look urgent. They get their own quiet line.',
      'Syncing is gentler on Halo and recovers by itself if your connection drops for a moment.',
      'The extension’s popup is cleaner and shows the same “last synced” time as Halo+.',
    ],
  },
  {
    week: '2026-10-12',
    items: [
      'Getting started is three steps: sign up, add the extension, done. On a phone, you can finish on your laptop.',
      'A live progress bar while your first sync runs, and you land back in Halo+ when it’s done.',
      'If your Halo is already connected to another Halo+ account, you get a clear choice instead of a dead end.',
      'Sync now always tells you how it ended.',
    ],
  },
  {
    week: '2026-10-05',
    items: [
      'Download a help kit for any assignment: the instructions, rubric and files in one zip.',
      'The assignment sheet is rebuilt around one checklist and one button.',
      '“Not now” skips something for today without losing it.',
      'One tap to mark something done, and the Calendar remembers the view you like.',
      '“Since you last looked” on Now: what’s new, moved or graded since your last visit.',
      'Grade warnings use the letter Halo shows for your class.',
    ],
  },
  {
    week: '2026-09-28',
    items: [
      'The Chrome extension syncs Halo on its own every 3 hours.',
      'Your due dates in Google Calendar, Apple Calendar or Outlook, kept up to date.',
      'Gold confetti when you turn something in, streaks with a skip day, and a Sunday recap.',
      'Ask a question about any assignment and get an answer from its own instructions.',
      'The Cooked meter shows how heavy the next 7 days are in each class.',
      'Syncs got about five times faster.',
    ],
  },
  {
    week: '2026-09-21',
    items: [
      'The Study tab: practice worksheets, flashcards and quiz-me from your own class material.',
      'Check your work against the rubric before you turn it in.',
      'Halo+ reads every announcement and puts what it asks on the right assignment, in your professor’s words.',
      'Works on iPhone and iPad from the Home Screen, with notifications.',
    ],
  },
];
