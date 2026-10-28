# Halo+ on Halo's pages: proposals (not built)

Written 2026-10-27 alongside extension 0.12.0. Four ideas from the On-Halo brief that were asked for as proposals only:
a better gradebook (2), a cleaner notification bell (3), new-grade badges on class cards (4), and "Ask about this" to
message the instructor (25). Each has two or three designs that would look like Halo built them, with what each costs
and risks, and a recommendation. Everything here comes from reading Halo's own public page code (the same research
behind 0.12.0), not from guessing.

The rules from the brief apply to all of them: show nothing unless Halo+ is sure, look like Halo, no clutter, the ⊕
mark on anything Halo+ adds, light on the computer and on Halo, Plus and Max only, one switch each.

## What Halo already does (so nothing is built twice)

- **Gradebook page** (`/courses/<class>/student/gradebook`): three cards at the top (Overall Grade as a letter, Points
  Earned as earned / possible, Percentage), then one table per topic: Assessment, Due Date, Submission Date, Status,
  Score, and an action button ("View Feedback" once graded). A yellow count shows grades not yet opened. Feedback
  (comments, rubric) is not on the page: "View Feedback" opens a separate view, and opening it tells Halo the grade
  was seen. **Halo has no what-if and no "what you need" anywhere.**
- **The bell**: a drawer called My Alerts with a list view and a class view, New and Read filters, mark read or unread,
  delete, and clear all. There are 17 alert types. Clicking an alert goes to `/alerts/<id>`, which marks it read and
  sends the student on. The count on the bell is Halo's unread count, refreshed every 5 minutes.
- **Class cards on Student Home**: no grade and no counts from Halo itself. Better Halo adds the grade and the small
  buttons with counts (Halo+ 0.12.0 adds counts only where Better Halo's are missing).
- **Messaging**: one conversation per class with the instructor, in Messages (`/inbox`). Assignment pages have no
  "message instructor" link; the only one is "Send message" on the syllabus. A message is written in Halo's editor and
  sent with Halo's Send button; Halo saves drafts of messages and puts a saved draft back in the box when the
  conversation opens.

## 2. A better gradebook on Halo's gradebook page

**Design A: one more card, and a "Missing" view (recommended first).**
A fourth card in Halo's row of cards, in the same card style: "To finish with an A: 88% on what's left" (or "An A is out
of reach; a B needs 81%"). Beside Halo's "Expand All", a quiet "Missing (2)" that opens only the topics with work past
due and not handed in, the rows highlighted the way Halo highlights a row.
- Seamless: it reuses Halo's own card and button looks, and adds one card and one button.
- Sure only when sure: the card shows only when Halo's own totals add up, meaning the possible points Halo shows equal
  the sum of the class's assignments as Halo lists them, so the class is graded on points with no hidden weights,
  extra credit or dropped scores. The letter cutoffs come from Halo's own grade scale for the class. Anything that does
  not reconcile: no card.
- Pros: answers the question students actually ask, adds very little to the page, and needs no new data. Halo+
  already reads the gradebook (the grade refresh) and the grade scale (the sync).
- Cons: weighted classes, if any, get no card at all, and "88% on what's left" can tempt over-reading early in the term.
  So it should only show after the class's first graded week.

**Design B: what-if, inside Halo's own table.**
A switch "What if…" beside "Expand All". While it is on, the Score cell of each ungraded row becomes a small number
field in Halo's score style, and the three cards show a second line in gray: "What if: A- · 90.4%". Nothing is saved to
Halo; turning it off puts the page back.
- Pros: the most useful tool for planning a hard week, and it is used where the student already looks.
- Cons: editable cells in Halo's table is the biggest change to Halo's page of anything here. It must not survive a
  reload, and it must say "What if" everywhere so nobody mistakes it for a real grade. It has the same points-only rule
  as A.

**Design C: a planner panel at the side.**
A narrow panel on the right, in the width of Halo's own sidebar: Missing work, What you need, What if, each folded.
- Pros: room for all three, and Halo's table is not touched.
- Cons: a new block on the page, so the page gets more crowded, and the page is already wide.

Recommendation: A first. B as an opt-in later if students ask. C only if A and B prove not enough.

## 3. A cleaner notification bell

**Design A: what matters, at the top of Halo's drawer (recommended).**
A short section above Halo's own list when the drawer opens: "Worth a look: 2 grades · 1 due date changed (CHM-113)",
each linking to Halo's own alert, then Halo's list exactly as it is.
- Seamless: Halo's list is untouched; it is one small section with the ⊕.
- Data: Halo's own alerts (the same query Halo uses). Reading them does not mark anything read; opening one goes
  through Halo's own alert page, which does.
- Pros: nothing hidden, nothing reordered, low risk.
- Cons: what matters is shown twice (in the section and in Halo's list).

**Design B: Halo's Class View by default, remembered.**
Halo already groups alerts by class (its Class View). Halo+ remembers which view the student picked last and opens the
drawer on it, the same way 0.12.0 remembers the calendar's 1 week / 2 weeks / all.
- Pros: tiny, and it uses Halo's own grouping.
- Cons: it is only grouping, not "what matters on top".

**Design C: quieter types, chosen by the student.**
A small "Hide…" menu in the drawer, in Halo's menu style, to hide chosen alert types (for example "New post in a
discussion"), with a "3 hidden" line that shows them again. Halo's count on the bell stays Halo's.
- Pros: real noise reduction for students in busy discussion classes.
- Cons: hiding alerts can hide something that mattered. It must be opt-in per type, never by default, and the count
  on the bell will not match what is shown, because Halo's count is Halo's.

Recommendation: A, plus B since it costs almost nothing. C only as an opt-in later.

## 4. New grade badges on class cards (and optional push)

**Design A: on the Halo+ line under each class card (recommended).**
"Halo+ · A- 91.0% · New: Quiz 2 · 2 this week". "New" uses Halo's own rule for an unseen grade (graded, and the
student has not opened its feedback), from the gradebook question Halo+ already asks for the grade. Clicking "New: Quiz
2" opens Halo's own feedback view for it, which marks it seen in Halo, exactly as Halo would.
- Seamless: no new element. It is one more part of a line that is already there, and the part drops off first when
  the card is narrow.
- Pros: no extra question to Halo (the grade refresh already asks), and it matches Halo's own count.
- Cons: the line gets longer. With a grade, "Next" and "this week" already there, "New" sometimes will not fit on
  Halo's narrowest card.

**Design B: rely on the gradebook button's count.**
Better Halo's gradebook button already shows Halo's count of unseen grades, and 0.12.0 fills it in where Better Halo's
is missing. For students without Better Halo, a tiny count beside the grade on the Halo+ line.
- Pros: almost nothing new.
- Cons: a number without a name ("2"), and it does not say which grade.

**Design C: optional push.**
"New grade in CHM-113" as a phone or desktop notification. The score is never in the notification; the student opens
Halo or Halo+ to see it. It comes from Halo+'s server when a sync finds a newly graded item. Off by default, one switch.
- Pros: timely, which is what people want from grades.
- Cons: on Free the extension syncs only while the student is on Halo, so a push would come late or never. It fits Plus
  and Max (syncs every 3 hours). A grade is sensitive, so the wording stays general, never the score.

Recommendation: A, with C as an opt-in for Plus and Max.

## 25. "Ask about this" (message the instructor), without it showing everywhere

**Design A: on selecting text in the instructions (recommended).**
When the student selects part of an assignment's instructions, a small "Ask about this" appears beside the selection,
the way a text editor shows a menu on selection. Pressing it opens Halo's Messages for that class with a draft already
in the box, ready to edit:
"About Topic 7 DQ 2: 'cite two peer-reviewed sources'. My question: ". The student writes and presses Halo's own Send.
- Seamless: invisible until the student selects text in instructions. Halo's own Messages, editor and Send.
- How: Halo puts a saved message draft back in the box when the conversation opens. Halo+ would save the draft the
  way Halo's own editor does, then open the conversation. This would be **the first time Halo+ writes anything to
  Halo** (a draft only, never a sent message), so it needs a clear yes from you first. It also needs a check on a
  real account that Halo shows the draft as the code says it does.
- Pros: shown only when the student shows intent, and the question quotes exactly what confused them.
- Cons: the write. A selection menu can surprise someone who selects text for another reason, so it would appear only
  for selections inside instructions, with a short delay.

**Design B: the same, without writing to Halo.**
"Ask about this" copies the prepared text ("About Topic 7 DQ 2: '…'. My question: ") and opens Halo's Messages for
the class in a new tab. The student pastes it.
- Pros: Halo+ still never writes to Halo. This could ship first.
- Cons: one more step (paste), and it is less magic.

**Design C: a small composer in the assignment view.**
A "Questions?" link in the assignment view's details. It opens a small box in Halo's style that sends through Halo's
own send.
- Pros: the fastest for the student.
- Cons: Halo+ would send messages on the student's behalf, the riskiest kind of write. It is a new place to type,
  away from Halo's Messages, so drafts and history live in two places. Not recommended.

Recommendation: start with B (no writes, shown only on selection), and move to A if you are comfortable with Halo+
saving a draft in Halo.
