# What the Halo gateway exposes

Read on 2026-09-17 from Halo's own JavaScript, not guessed. `https://halo.gcu.edu/` serves its Next.js chunks
unauthenticated, so every operation and fragment below was extracted verbatim from the shipped bundles
(`_next/static/chunks/*.js`, build `JUoiw4QkILFLltERnUSei`). Better Halo was re-read too and contributes nothing new:
it only ever used `getCourseClassesForUser` and `getAllClassGrades`, both already in the bookmarklet.

**106 named queries and 53 mutations.** Most are instructor-side or administrative. What follows is every one a student
account can use, what it gives this app, and whether it moves the needle on never opening Halo.

Endpoint and auth are unchanged: `POST https://gateway.halo.gcu.edu/` with `Authorization: Bearer <authToken>` and
`ContextToken: Bearer <contextToken>` from `/api/auth/session`. Files are the exception — see the last section.

## Pulled by one click

Eleven queries, each in its own `try`. Order is the order they run.

| Query | Operation | Gives |
| --- | --- | --- |
| `getCourseClassesForUser(pgNum, pgSize)` | — | Classes, units, assessments with descriptions, points, tags, due dates |
| `getAllClassGrades(courseClassSlugId, courseUnitId)` | — | Per-assessment status, submission date, accommodated due date, points history |
| `announcements(courseClassId)` | `GetAnnouncementsStudent` | Announcement forums and their posts: body, publish and modified dates, author, acknowledgement flags, attached resources |
| `getCourseClassBySlugId(slugId)` | `CurrentClass` | `gradeScale`, `participationPolicy`, `holidays`, `units { current sequence startDate endDate }`, and which assessments carry a rubric |
| `getAllClassGrades` | `AssessmentFeedback` | `finalComment`, `rubricScores { criteriaId rubricCellId comment }`, `userQuizAssessment { userQuizId }`, `post { publishDate wordCount postStatus }` |
| `getCourseClassAssessmentById(id)` | `AssessmentRubric` | The real rubric: criteria, points, sequence, achievement levels |
| `getCourseClassBySlugId(slugId)` | `courseClassResources` | Course materials as the professor filed them, class-level and per unit, with `instructorAdded` |
| `getAllDQForCourseClass(...)` | `AllDQForCourseClass` | Discussion forums and thread counts |
| `userQuiz(id)` / `userQuizResult(id)` | `GetQuizResult` | Quiz attempt: final score, answered, correct, incorrect |
| `getUserAlerts(userAlerts)` | `GetUserAlerts` | Halo's own notification feed, typed, with a read flag |
| `getInboxLeftPanel` | `GetInboxLeftPanel` | Direct messages between student and instructor |

Caps per sync, so one click stays one click: 12 rubrics, 8 quiz results, 10 rubric files.

## Deliberately not built

- `getGradingNotifications(slugId)` (`SidebarGradebookNotifications`) — returns only `{ count }`. The alert feed already
  says which thing was graded, by name. A number adds nothing.
- `posts(forumId, postId, depthStart, depthEnd, dqPostFilters)` — classmates' full discussion threads. The student's own
  post is already confirmed by `post { publishDate wordCount }` on the feedback query, which is the part that matters.
  Pulling every classmate's text is a lot of payload for something the app does not act on.
- `getApplicableHolidaysForCourseClass`, `GetHolidays`, `getCurrentUTCTime` — `CurrentClass.holidays` already covers it.
- `GetUserProfile*`, `GetUserPreferenceDetails`, `GetAlertSettings`, `GetAllActiveUserDevices` — account settings.
- `StudentParticipation`, `GetParticipationGrading` — participation is attendance; the app keeps it out of Now.
- `getDQDraftSubmission`, `getDQFilterCount`, `dqForumContextList` — forum plumbing behind the discussion queries.
- `GroupDueDate(groupId)` — group-specific due dates. Only matters for CLC work, and the grades query already carries
  the accommodated date.
- `getClassTranscriptReport`, `searchClassTranscriptReport` — instructor-side.
- Everything named `*Instructor*`, `*Grading*`, `*Roster*`, `*Impersonator*`, `Validate*`, `findUsers`, `getAllRoles` —
  instructor or admin only; a student token is refused.
- **All 53 mutations.** This app reads Halo and never writes to it.

## Files: not GraphQL

Rubric attachments, announcement attachments, and course resources come back as resource records with
`{ id kind name type }` and no URL. The bytes are fetched over REST at `<apiBase>downloadUrl/<resourceId>` with the same
session headers. The base is read from the page rather than guessed:

```js
JSON.parse(document.getElementById('__NEXT_DATA__').textContent).runtimeConfig.orchestrationApiEndpoint
```

Done for rubric PDFs only, up to ten per sync, since those are the documents the class actually grades against. Not done
for every attachment.

## The rule this follows

Every query sits in its own `try`. A shape that turns out to be wrong loses that one kind of data for that one class,
and the assignments and grades still arrive. Freshness is stamped per class per kind from what actually came back, so
the app can say "rubrics for ENG-105 are 6 days old" rather than implying everything is current because one call was.
