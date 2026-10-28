# Halo's own pages, as Halo+ 0.12.0 reads them

Read on 2026-10-27 from Halo's public page code (build `T6KDgoiIaE-TpnamHsnFp`, app v1.4.23): the same files any
visitor's browser downloads. No account was used. This is what each on-Halo feature depends on, so a Halo update that
breaks one can be found fast. Every feature looks for these by Halo's stable ids and test ids first, and by the start of
a class name second (`[class*="CourseCard_cardContainer"]`), because the ending of Halo's class names
(`__ME7dH`) changes with Halo's builds. When something is not there, the feature shows nothing.

## Halo facts every feature leans on

| Fact | Where it comes from | Used by |
| --- | --- | --- |
| Every course date is shown in Halo's school time zone, America/Phoenix, never the browser's | `tenantConfig.timezone` in the page's `#__NEXT_DATA__` (read at run time, `core.js zone()`) | 5, 1, 8, 9, 18, search |
| Halo's date text is `"MMM D, YYYY, h:mm A"` ("Nov 1, 2026, 11:59 PM") | Halo's date formats | 5 (`logic.js haloDateTime`, round-trip checked) |
| Halo's own session gives the tokens and the student's id | `GET /api/auth/session` → `authToken`, `contextToken`, `userId` | every question to Halo |
| Questions go to Halo's gateway as GraphQL; files and posts go to Halo's file service as REST | `gateway.halo.gcu.edu`, `runtimeConfig.orchestrationApiEndpoint` | `core.js ask()` (reads only, mutations refused), 15 |
| Halo's pages may not be framed | `X-Frame-Options: DENY` on every page | why 15 shows the file, not Halo's viewer page |
| Better Halo's themes recolour Halo through `--better-halo-*` variables; `--lms-primaryColor` becomes the page background under them | Better Halo 0.8.4 | `tokens.css` (never uses `--lms-primaryColor` under a theme) |
| Halo's stylesheet makes every `svg` a block | Halo's Tailwind reset | `tokens.css` keeps the ⊕ inline |
| Halo moves between pages without reloading (Next.js `pushState`), and fires no `hashchange` for its own views | Next.js 12 | `core.js`: one MutationObserver plus the Navigation API, no polling |

## Per feature

| # | Feature | Halo's page | What it finds | What it asks Halo |
| --- | --- | --- | --- | --- |
| 0 | Search | Student Home: after `#Home--main [role="tablist"]` (or Better Halo's `.better-halo-tabs-wrapper`); Ctrl/⌘+K on any page except in `input`, `textarea`, `[contenteditable]`, `.ProseMirror` (Halo's editor uses Ctrl+K) | — | nothing (the index from the last sync) |
| 6 | Next on class cards | the Halo+ class line on `[class*="CourseCard_cardContainer"]` | — | nothing |
| 18 | Drafts | `[data-testid="post_text_editor"]` with `.ProseMirror`; the box's place (`.toggleReplyEditor`, `[data-testid^="post_card_container_"]`, `#discussion-submission/<id>/fid/<forum>`); Halo's "Discussion post/response has been submitted" toast | Halo saves its own drafts 5 s after typing stops and restores them | nothing |
| 19 | Word minimum | Halo's footer count `.tiptap-editor [aria-live="polite"][aria-atomic="true"]` ("152 words"); the prompt `#scrollRef_dq_description [data-testid="description"]` | Halo already counts words; it has no minimum field | nothing |
| 21 | Rubric | Halo's own `a[data-testid="print_rubric_link"]` "View Rubric" (its address carries the assessment id) in the card's details row `.bg-grayF2`: a plain click opens the rubric right below that row, a second closes it (0.12.1); Ctrl/⌘/Shift/middle clicks stay Halo's | Halo's rubric opens in a new tab only | `AssessmentRubric`, when the student points at the link; if Halo does not send it within 3 s, Halo's own rubric page opens |
| 5 | How long you have | `p[data-testid="date_time_data_due_date"]` (and its accommodated line `[class*="FormattedDateTimeDisplay_dateWithPrefix"]` / `_timePart`), the view's "Due on: …", `[data-testid="date_time_data_due_date_time"]` on a quiz | done = Halo's check icon or status LATE/SUBMITTED/PUBLISHED | nothing |
| 1 | All classes on the calendar | Student Home: Halo's tab row `#Home--main [role="tablist"]` (a "Calendar" tab made from Halo's own tab classes, `Tab_tab` / `Tab_activeTab`; Halo's panel is the `<section>` it mounts after the tabs). A class page: `#calendar-container`, `#guide_anchor_dashboard_calendar` and its day headers ("Tue, Oct 27"; "T"/"27" at 1024px and narrower) | each item on its due day (0.12.1): Halo's calendar uses `grade.dueDate ?? class dueDate` (the accommodated date is not used), in Halo's zone | `StudentAssessmentDetails` per class when the tab or All classes opens, kept 10 minutes |
| 14 | View choices | `[data-testid="dashboard_calendar_num_weeks_1|2|all"]`; Student Home's last tab and 1 Week / 2 Weeks (0.12.1) | Halo resets to 2 Weeks on every visit; it remembers the gradebook's and the alerts' views itself | nothing |
| 7 | Topic progress | `[class*="CourseUnitHeader_topicContainer"]` row with "Max Points:", `#assessments [data-testid="assessment_card"]`, `[class*="CheckIcon_checkIcon"]`, `[data-testid="status"]` | Halo's check = LATE, SUBMITTED or PUBLISHED | nothing |
| 8 | Submission check | the card's Status cell (`[data-testid="status"]`'s parent), `[data-testid="dashboard_calendar_view_submission"]`; in the view `#assignment-submission/<id>`, `a[class*="AssignmentSubmissionTable_filename"]`, Halo's "Review and Submit" dialog | Halo's card shows only the check and the "Submitted" chip; the time and files are inside the assignment ("Submitted on …"), so 0.12.1 adds only those two under the chip | `AssignmentSubmission` (handed-in cards, at most 4 a page); `CourseClassAssessment` (in the view) |
| 9 | Participation | `#scrollRef_dq_description [class*="DiscussionDescriptionCard_discussionHeaderMeta"]` | the rule is the class's `participationPolicy {numDays, numPosts}`; the week is the topic's participation dates | `StudentParticipation` (`participationPosts`) |
| 15 | Files on the page | `a[href="/resource/<id>"]` whose name ends in `.pdf` (a plain click only) | Halo opens every file in a new tab | `GetResource`, then the file from Halo's file service |
| 23 | Last feedback | open cards' instructions block; titles of the class's graded work | reading feedback this way does not mark it seen (Halo's own view does) | `StudentAssessmentDetails`, then `AssessmentFeedback` (at most 2 a card, 2 cards a page) |
| 26 | Card counts | Better Halo's `.better-halo-icon-button[data-section]`; its `.better-halo-notification-badge` | Better Halo already shows Halo's counts; Halo's sidebar reads discussions as DQ + IDQ | `SidebarForumNotifications`, `SidebarGradebookNotifications` per class, only when Better Halo's counts are missing, kept 5 minutes |
| 28 | Links | `[class*="AnnouncementCard_announcementDescriptionContainer"] [data-testid="description"]`; Halo's link class `HTMLDescription_link` | Halo adds no links when it shows a post | nothing |
| 13 | Fetch ahead | `/_next/static/<buildId>/_buildManifest.js` (Halo's own public file), the routes for a topic page, a discussion and a quiz | Halo already fetches code for links on screen; its data is fetched fresh on every page | nothing (Halo's public files only, once per Halo version) |

## When Halo changes

- A test id or class start that is gone: that feature shows nothing; the others keep working (each runs on its own).
- A query Halo renames or reshapes: Halo answers with an error; `ask()` throws; the feature shows nothing.
- The time zone setting gone: features that read Halo's dates show nothing.
- To re-check after a Halo update: download the new build's files (the research steps in LOOP_LOG Loop 271), then run
  the `e2e-onhalo-*` tests; the stand-in pages take Halo's live stylesheets and class names (`scripts/lib/haloReal.mjs`),
  so a renamed component shows up as a failing look check.
