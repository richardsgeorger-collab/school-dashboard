# What the Halo gateway exposes

Read on 2026-09-17 from Halo's own JavaScript, not guessed. `https://halo.gcu.edu/` serves its Next.js chunks
unauthenticated, so every operation and fragment below was extracted verbatim from the shipped bundles
(`_next/static/chunks/*.js`, build `JUoiw4QkILFLltERnUSei`). Better Halo was re-read too and contributes nothing new:
it only ever used `getCourseClassesForUser` and `getAllClassGrades`, both already in the bookmarklet.

**106 named queries and 53 mutations.** Most are instructor-side or administrative. What follows is every one a student
account can use, what it would give this app, and whether it moves the needle on never opening Halo.

Endpoint and auth are unchanged: `POST https://gateway.halo.gcu.edu/` with `Authorization: Bearer <authToken>` and
`ContextToken: Bearer <contextToken>` from `/api/auth/session`. Files are the exception — see the last section.

## Already pulled

| Query | Gives | Status |
| --- | --- | --- |
| `getCourseClassesForUser(pgNum, pgSize)` | Classes, units, assessments with descriptions, points, tags, due dates | In the bookmarklet |
| `getAllClassGrades(courseClassSlugId, courseUnitId)` | Per-assessment status, submission date, accommodated due date, points history | In the bookmarklet |
| `announcements(courseClassId)` (`GetAnnouncementsStudent`) | Announcement forums and their posts: full body, publish and modified dates, author, acknowledgement flags, attached resources | **Built this iteration** |

## Worth building, in the order I would build them

| Query | Args | Gives | Why it matters |
| --- | --- | --- | --- |
| `getCourseClassAssessmentById(id)` (`AssessmentRubric`) | assessmentId | The real rubric: `criteria { name description points sequence achievementLevels }` | The app currently infers rubrics from descriptions and library files. This is the graded truth, per criterion, with the levels. It would make "what earns points", the draft check, and the paste-prompt exact instead of inferred. **Highest value after announcements.** |
| `getGradeForUserCourseClassAssessment(courseClassAssessmentId, userId)` (`AssessmentFeedback`) | assessmentId, userId | `finalComment { comment commentResources }`, `rubricScores { criteriaId rubricCellId comment }`, submission, quiz and participation summaries | The instructor's actual written feedback and per-criterion scores. Today the app knows a score and nothing about why. This is what turns a grade into something to learn from, and it feeds weak-topic detection with real reasons. |
| `getCourseClassBySlugId(slugId)` (`courseClassResources`) | slugId | `resources { title description instructorAdded instructorOnly sequence resources { contentType resource { kind name type } } }` plus the same per unit | Course materials as the professor filed them, including anything they added mid-term. Pairs with the library: it would tell the app what exists even before a file is dropped in. |
| `getCourseClassBySlugId(slugId)` (`CurrentClass`) | slugId, isStudent | `holidays`, `participationPolicy`, `gradeScale`, `instructors`, `units { title sequence startDate endDate current points description }` | The grade scale and participation policy are guessed at today. `holidays` explains gaps in the calendar. `units.current` says which topic the class is actually in. Cheap, one call per class. |
| `getAllDQForCourseClass(courseClassId, sortBy, pgNum, pgSize)` and `posts(forumId, postId, depthStart, depthEnd, dqPostFilters)` | courseClassId / forumId | Discussion forum threads and replies | Confirms whether a DQ post and its two replies actually went in, which is exactly the thing the submission check cannot see today. Also the classmates' posts, which the tutor could use for "what is the class arguing about". |
| `userQuiz(id)` / `userQuizResult(id)` (`GetQuizResult`) | userQuizId | Quiz attempt with question-level results | Question-level breakdown is the best possible input to topic-level weakness. Needs a `userQuizId`, which comes from the grades query's `userQuizAssessment`. |
| `getUserAlerts(userAlerts)` | paging input | Every alert with `type`, `isRead`, and `data { announcementTitle assignmentTitle assessmentId forumId postId senderName }` | Halo's own notification feed, already typed and already carrying a read flag. The cheapest possible "what changed since last time" signal, and it covers kinds the app does not poll for. |
| `getInboxLeftPanel` / `getPostsForInboxForum(forumId, pgNum, pgSize)` | — / forumId | Direct messages between student and instructor | A message saying "your draft is fine, focus on the conclusion" is as load-bearing as an announcement and currently invisible. |
| `getGradingNotifications(slugId)` (`SidebarGradebookNotifications`) | slugId | What has been newly graded | One small call that says "something was graded" without diffing the whole gradebook. |

## Real but not worth it

- `getApplicableHolidaysForCourseClass`, `GetHolidays`, `getCurrentUTCTime` — `CurrentClass.holidays` already covers it.
- `GetUserProfile*`, `GetUserPreferenceDetails`, `GetAlertSettings`, `GetAllActiveUserDevices` — account settings.
- `StudentParticipation`, `GetParticipationGrading` — participation is attendance; the app deliberately keeps it out of Now.
- `getDQDraftSubmission`, `getDQFilterCount`, `dqForumContextList` — forum plumbing behind the discussion queries above.
- `GroupDueDate(groupId)` — group-specific due dates. Only matters for CLC work, and the grades query already carries the accommodated date.
- `getClassTranscriptReport`, `searchClassTranscriptReport` — transcripts of class sessions, instructor-side.
- Everything named `*Instructor*`, `*Grading*`, `*Roster*`, `*Impersonator*`, `Validate*`, `findUsers`, `getAllRoles` — instructor or admin only; a student token will be refused.
- All 53 mutations. This app reads Halo and never writes to it.

## Files: not GraphQL

Rubric attachments, announcement attachments, and course resources come back as resource records with
`{ id kind name type }` and no URL. The bundles fetch the bytes over REST at `<apiBase>downloadUrl/<resourceId>`, and
uploads use `POST <apiBase>generate-presigned-urls`. So attachments are reachable with the same session headers, but
through a second, non-GraphQL call per file. Worth doing for rubric PDFs specifically, since those are the documents
the class actually grades against; not worth doing for everything.

## The rule this follows

Every new query goes in its own `try` inside the bookmarklet, exactly as announcements did. A shape that turns out to
be wrong loses that one kind of data for that one class, and the assignments and grades still arrive. Nothing is added
to the shared payload path until it has come back clean once.
