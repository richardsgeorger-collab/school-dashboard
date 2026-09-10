# School Dashboard

A phone-friendly planner built from GCU syllabus PDFs. It extracts every assignment, quiz, exam, lab, and project, estimates how long each will take, and works backward from your available study hours to tell you when to start. Data lives in your browser and syncs across devices through Supabase when you sign in.

Live app: https://richardsgeorger-collab.github.io/school-dashboard/

## What it does

- **Calendar** is the home screen. It opens on the current week with a level bar, risk counts, and a "Do next" list (overdue, at risk, start today, due soon) above month, week, and agenda views. Items show as state-aware chips: overdue is red, due today is solid class color, due soon is bold, at risk carries an amber bar, done is struck through. Heavy days get a tinted cell and a count badge; overflow collapses into a course-colored bar instead of "+N more."
- **Short labels** like "Chem Quiz 1" or "Eng Math HW 3" are generated from each syllabus title (`src/domain/labels.ts`) and used everywhere; the full syllabus name stays as subtitle and tooltip, and each label is editable in the item editor.
- **Plan** shows the week as a time budget (planned hours per class stacked against your capacity), hours by class, and your progress: level and XP, daily streak, clean-week streak, badges, and last week's recap.
- **Points**: finishing an item earns its point value × 1.5 if done by its start-by date, × 1 by the due time, × 0.5 late, then × your score once graded. Awards lock at first completion, so undoing and redoing never re-awards. Badges: Early Bird (5 early finishes), Survived the Week (a full-capacity week cleared on time), Clean Sweep (every item one class had due in a week, on time). A recap card appears on Sundays.
- **Load** is a heatmap of planned study hours per class per week for the whole term, so heavy weeks are visible in advance. Weeks over capacity turn red.
- **Grades** tracks points earned over points graded per class. The syllabi publish no category weights, so it is points-based.
- **Settings** holds sync, study-hour capacity, class colors and meeting times, syllabus import, and backup.

## How the schedule works

Every item gets an estimate in minutes from rules in `src/domain/estimate.ts` (type, points, and title keywords). You can override any estimate in the item editor.

The scheduler in `src/domain/schedule.ts` walks items from the latest deadline to the earliest and fills each one's minutes into the latest free days before it is due, aiming to finish one day early (two days for anything over four hours). Days have a capacity from Settings (default 3 h weekdays, 5 h weekends). The first day an item touches is its start-by date. Marking something done frees its days and everything else recomputes.

Flags: **Overdue** is past due. **At risk** means the item cannot fit in the remaining capacity, or its latest feasible start has passed. **Due soon** is within 48 hours. **Start today** means the start-by date is today or earlier.

Items due before 6 PM are treated as due the night before, so an 8 AM in-class quiz is studied for the previous day.

## Sync with Supabase

1. Create a free project at supabase.com. In Authentication settings, turn off email confirmation so you can sign in immediately.
2. Open the SQL editor, paste `supabase/schema.sql`, and run it once.
3. In the app, open Settings, paste the Project URL and anon public key, save, then create an account and sign in. Repeat the sign-in on your other device.

Without Supabase the app works fully on one device using browser storage. To bake the connection into the deployed build, set repository variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in GitHub (Settings → Secrets and variables → Actions → Variables).

## Importing a syllabus

Settings → Import syllabus PDF. Download the syllabus from the class page in Halo and drop it in. The parser (`src/parser/gcuSyllabus.ts`) reads the course header, instructors, topics, and every assessment row, then classifies and estimates each item. Re-importing a class you already have offers a merge that keeps your scores and done marks.

## Development

```bash
npm install
npm run dev        # http://localhost:5173/school-dashboard/
npm test           # vitest
npm run build      # type-check + production build
npm run seed       # regenerate src/data/seed.json from syllabi/*.pdf (or the text fixtures)
```

Put syllabus PDFs in `syllabi/` and run `npm run seed` to rebuild the bundled starting data. Debug a PDF with `npx tsx scripts/parsepdf.ts path/to/file.pdf`.

Deploys happen automatically from `main` via GitHub Actions to GitHub Pages.
