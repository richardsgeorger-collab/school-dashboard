# Halo's student gradebook page

Read on 2026-10-29 from Halo's public JavaScript, build `T6KDgoiIaE-TpnamHsnFp` (the same build cached in
`.scratch/halo-build.json`). The raw chunks, the modules pulled out of them, and a prettified copy of the main
module (`m88370.pretty.js`) are in `.scratch/halo-gradebook/`. Everything below is quoted from the bundle unless
it says otherwise. Nothing here comes from a logged-in page.

Route: `/courses/[slugId]/student/gradebook`, page chunk
`static/chunks/pages/courses/[slugId]/student/gradebook-31d40f2909992a71.js`, route CSS
`de93133c943bbc97.css`, `44f170a4a2aeaa9b.css`, `96b11cd2a5f38f6b.css` (the gradebook rules are in the last two).
Page permission: `m.auth={exactPermission:"view_grades"}`.

## 1. Modules, components, operations

The page module (56517) is small: it renders a `<title>`, the page header and one shared component, 88370,
which is the same gradebook the instructor uses for one student. The student page always passes
`isInstructorStudentGbView: true, studentGradebookViewOnly: true` (both are `useState(!0)[0]`).

| Module | Component (my name for it, minified name) | CSS module |
| --- | --- | --- |
| 56517 | page `m` | `StudentGradebook_*` (2602) |
| 35294 | page header `<header><h1>` | `PageTitle_*` (77482) |
| 88370 `si` | `<main>` gradebook container | `ni().gradebookContainer`: 2602 has no such key, so the class renders as `undefined` (bundle quirk) |
| 88370 `L` | progress cards row | `StudentProgressCards_*` (17203) |
| 88370 `m` | profile card | `ProfileCard_*` (71262) |
| 88370 `k` + `N` | score card + its tooltip | `GradingScoreCard_*` (44805) |
| 68150 | score / points display | `Points_*` (79402) |
| 88370 `ei` | topics section, with Expand All (16207) and the class card (1930) | `SectionHeader_*`, `ClassModificationsHeader_*` |
| 88370 `We` | one topic (unit) accordion | `TopicGrouping_*` (4508) |
| 88370 `Me` | assessments table (desktop) or card list (narrow) | `AssessmentTable_*` (43175) |
| 42800 | generic `LMSTable` (react-table `useTable` + MUI Table) | `LMSTable_*` (80338) |
| 88370 `Ue`/`je` | narrow-screen assessment card | `studentFeedbackCard_*` (14768) |
| 48133 | status badge | `GradeStatusBadge_*` (62224) |
| 88370 `Ne` | action button | none; `AssessmentTable_assessmentStatusBtn` |
| 88370 `Ce` | date + time display | `FormattedDateTimeDisplay_*` (95959) |

MUI used: `TableContainer` (with `component: Paper`), `Table`, `TableHead`, `TableRow`, `TableCell`,
`TableSortLabel`, `TableBody`, `Collapse` (topic body), `IconButton` (topic toggle), `Button` (action
button, Expand All), and a Tooltip wrapper (41364). It does **not** use MUI `Accordion`. The topics are
hand-built divs with a `Collapse`.

### GraphQL operations the page runs

1. **`GradeOverview`** (module 98039, `fetchPolicy: "no-cache"`), with variables
   `{ courseClassSlugId: slugId, courseClassUserIds: String(query.courseClassUserId ?? "") }`. On the student
   route there is no `courseClassUserId`, so it sends `""`.

```graphql
query GradeOverview($courseClassSlugId: String!, $courseClassUserIds: [String]) {
  gradeOverview: getAllClassGrades(
    courseClassSlugId: $courseClassSlugId
    courseClassUserIds: $courseClassUserIds
  ) {
    ...GradeOverview_gradeOverview
  }
}

fragment GradeOverview_gradeOverview on UserCourseClassGrade {
  finalGrade { ...GradeOverview_gradeOverview_finalGrade }
  grades { ...GradeOverview_gradeOverview_grades }
}

fragment GradeOverview_gradeOverview_finalGrade on UserCourseClassFinalGrade {
  id
  finalPoints
  gradeValue
  isPublished
  maxPoints
}

fragment GradeOverview_gradeOverview_grades on UserCourseClassAssessmentGrade {
  isEverReassigned
  userLastSeenDate
  assignmentSubmission { ...GradeOverview_gradeOverview_grades_assignmentSubmission }
  assessment { ...GradeOverview_gradeOverview_grades_assessment }
  post { ...GradeOverview_gradeOverview_grades_post }
  assessmentGroup { ...GradeOverview_gradeOverview_grades_assessmentGroup }
  dueDate
  accommodatedDueDate
  finalComment { ...GradeOverview_gradeOverview_grades_finalComment }
  finalPoints
  id
  status
  userQuizAssessment { ...GradeOverview_gradeOverview_grades_userQuizAssessment }
  history { ...GradeOverview_gradeOverview_grades_history }
}

fragment GradeOverview_gradeOverview_grades_assignmentSubmission on AssignmentSubmission { id submissionDate }
fragment GradeOverview_gradeOverview_grades_assessment on CourseClassAssessment { id }
fragment GradeOverview_gradeOverview_grades_post on Post { id forumId publishDate }
fragment GradeOverview_gradeOverview_grades_assessmentGroup on CourseClassAssessmentGroup {
  id
  groupUsers { ...GradeOverview_gradeOverview_grades_assessmentGroup_groupUsers }
  status
}
fragment GradeOverview_gradeOverview_grades_assessmentGroup_groupUsers on CourseClassAssessmentGroupUser {
  user { ...GradeOverview_gradeOverview_grades_assessmentGroup_groupUsers_user }
}
fragment GradeOverview_gradeOverview_grades_assessmentGroup_groupUsers_user on User { id }
fragment GradeOverview_gradeOverview_grades_finalComment on GradeFinalComment {
  comment
  commentResources { ...GradeOverview_gradeOverview_grades_finalComment_commentResources }
}
fragment GradeOverview_gradeOverview_grades_finalComment_commentResources on GradeFinalCommentResource {
  resource { ...GradeOverview_gradeOverview_grades_finalComment_commentResources_resource }
}
fragment GradeOverview_gradeOverview_grades_finalComment_commentResources_resource on Resource {
  id kind name type active context description embedReady
}
fragment GradeOverview_gradeOverview_grades_userQuizAssessment on QuizUserCourseClassAssessment {
  accommodatedDuration dueTime duration startTime submissionDate userQuizId
}
fragment GradeOverview_gradeOverview_grades_history on UserAssessmentHistory { comment dueDate status }
```

(Fragments on one line here only to save space; the bundle text is the same fields in the same order. The
verbatim text is in `.scratch/halo-gradebook/m98039.js`.)

2. **`GetUserProfileWithAccommodations`** (80975), variables `{ userId: query.sid ?? session.userId }`:

```graphql
query GetUserProfileWithAccommodations($userId: String!) {
  userInfo: getUserById(id: $userId) {
    ...GetUserProfileWithAccommodations_userInfo
  }
}

fragment GetUserProfileWithAccommodations_userInfo on User {
  id
  firstName
  preferredFirstName
  lastName
  userImgUrl
  sourceId
  isAccommodated
}
```

3. **Class data** comes from the course layout's context (91532 → context 60471, `classData.currentClass`),
   not from this page. It supplies `units[] { title current assessments[] { id title type points dueDate
   inPerson isGroupEnabled isAlternate parentId tags } }`, `classCode`, `name`, `credits`, `startDate`,
   `endDate`, `description`, `modality`. Which query that context runs is not in this route's chunks (it is
   the layout's `CurrentClass`-style query documented in docs/halo-api.md; I did not re-verify its text).

4. **`GetForumId`** (64356) runs only on click of a "Go to Discussion" action button:
   `query GetForumId($contextId: String!, $courseClassId: String!) { getForumId(contextId: $contextId, courseClassId: $courseClassId) }`.

Fields actually displayed: `finalGrade.gradeValue`, `finalGrade.finalPoints`, `finalGrade.maxPoints`; per row
the assessment's `title`, `type` (icon only), `points`, and from the grade `status`, `finalPoints`, `dueDate`
(falls back to the assessment's), `accommodatedDueDate`, `isEverReassigned`, `userLastSeenDate`, and the
submission date (`assignmentSubmission.submissionDate` / `post.publishDate` /
`userQuizAssessment.submissionDate` by type). `finalComment`, `history`, `isPublished` and `assessmentGroup.status`
are fetched but not rendered on this page.

## 2. The DOM

Strings (from 64586 `B4`): `GRADEBOOK_TITLE:"Gradebook"`, `OVERALL_GRADE:"Overall Grade"`,
`POINTS_EARNED:"Points Earned"`, `PERCENTAGE:"Percentage"`, `NO_SCORES:"No score"`, `ASSESSMENT:"Assessment"`,
`ASSESSMENT_TYPE:"Assessment Type"`, `DUE_DATE:"Due Date"`, `SUBMISSION_DATE:"Submission Date"`,
`SUBMITTED_DATE:"Submitted Date"`, `STATUS:"Status"`, `SCORE:"Score"`, `ACTION:"Action"`,
`ASSESSMENTS_FOR:"Assessments for {0}"`, `TOPIC_PREFIX:"Topic"`, `POINTS:"Points"`, `CURRENT:"Current"`,
`EXPAND_ALL:"Expand All"`, `COLLAPSE_ALL:"Collapse All"`, `MAX_POINTS:"Max Points"`, `CREDITS:"Credits"`,
`COURSE_DESCRIPTION:"Course Description"`, `ID:"ID"`, `ACCOMMODATED:"Accommodated"`, `HONORS:"Honors"`,
`VIEWED_TIME_ON_STUDENT_GRADEBOOK_PAGE:"Viewed {0}"`, `ACCOMMODATED_DUE_DATE:"Accommodated Due Date"`,
`ASSESSMENT_SUBMITTED:"Assessment Submitted"`. Tooltips: `OVERALL_GRADE_TOOLTIP:"Your current letter grade
according to the Grade Scale, located in the Syllabus"`, `POINTS_EARNED_TOOLTIP:"The number of points you have
earned and total points possible based on all Published assessments"`, `PERCENTAGE_SCORE_TOOLTIP:"The
percentage of points you have earned based on all Published assessments"`. Action labels: `"View Feedback"`,
`"Submit Assignment"`, `"View Submission"`, `"Submit DQ Response"`, `"View response"`, `"Go to Discussion"`,
`"Go to Quiz"`, `"Open Assignment"`.

Guide anchors (67234 `I$`, used as plain class names, stable across builds): `YD`
`guide_anchor_studentGradebook_progress`, `Oy` `…_topicPoints`, `KW` `…_topicExpanded`, `WD` `…_expandTopic`,
`WK` `…_assessmentTable`, `yv` `…_viewFeedback`, `ZU` `…_feedbackContainer`, `db` `…_assessmentColumn`.

### Overall tree

```
div.StudentGradebook_gradebookPage__t3k7G [+ .StudentGradebook_isSidebaropen__d9Vt6 when the side nav is open, else "false"]
├─ (Helmet) <title data-testid=appTitle>"{slugId.substr(0,7)} Gradebook "</title>
├─ header.PageTitle_underlinedHeaderContainer__bG5B2.StudentGradebook_icontext__Qb4Lu
│   └─ div.flex.items-center
│       ├─ span.PageTitle_icon__IxWoR > svg (MUI LibraryBooks icon)
│       └─ h1.PageTitle_headerText__mtknd.focus:outline-none  "Gradebook"     (no data-testid on this page)
└─ main.undefined                                    (ni().gradebookContainer is not in the CSS map)
    ├─ section.StudentProgressCards_progressCards__znZGW#guide_anchor_studentGradebook_progress
    │   ├─ ProfileCard  (see below)
    │   ├─ ScoreCard "Overall Grade"
    │   ├─ ScoreCard "Points Earned"
    │   └─ ScoreCard "Percentage"
    │   (instructor only: div.StudentProgressCards_viewMessagesRow > Button "View Messages")
    └─ section
        ├─ SectionHeader (16207): section.mb-2 > div.flex.items-end.justify-between.section-header-wrapper
        │     ├─ div.flex.items-center.p-2 > h4[data-testid="header"] (empty: no subHeading passed)
        │     └─ div.flex.items-center > (Expand All button, only when showExpandAll)
        │          button.SectionHeader_expandButton__7RrUd[data-testid="expand_all_collapse_all"]
        │             aria-expanded, children: sr-only span, icon, span "Expand All" | "Collapse All"
        ├─ spinner [data-testid="spinner"] while loading;  error component (8351) on error
        ├─ class card (1930) — always on the student page (isInstructorStudentGbView=true)
        └─ one TopicGrouping per unit, in units order
```

### Profile card (88370 `m`)

```js
(0,s.jsxs)("div",{className:v().profileCard,children:[(0,s.jsx)(l.Z,{user:i,displayName:n,className:v().profileIcon}),
 (0,s.jsxs)("div",{"data-testid":c.gradebook.studentInfo,className:"w-2/3 break-words",children:[
  (0,s.jsx)("p",{"data-testid":c.gradebook.studentName,className:v().profileName,children:n??""}),
  (0,s.jsxs)("p",{"data-testid":c.gradebook.studentId,className:v().profileId,children:[d.B4.ID,": ",a]}),
  (0,s.jsxs)("div",{className:v().profileIcons,children:[u&&(span.profileAccommodation icon + "Accommodated"),
                                                          _&&(span.profileAccommodation icon + "Honors")]})]})]})
```

Test ids: `student_info`, `student_name`, `student_id`. Text: `"ID: <sourceId>"`. Classes
`ProfileCard_profileCard__UzaqL`, `ProfileCard_profileIcon__OH4n2`, `ProfileCard_profileName__i18E5`,
`ProfileCard_profileId__0SvEw`, `ProfileCard_profileIcons__bg_UG`, `ProfileCard_profileAccommodation__nWr0U`.
The display name is built by `R.vk` (7055) from first/preferred/last name; exact format not traced.

### Score cards (88370 `k`, `N`) — the overall grade

```js
var N=function(e){var i=e.tooltip;return(0,s.jsx)(f.Z,{placement:"top",title:i,children:(0,s.jsxs)("div",{
  className:p().tooltip,tabIndex:0,role:"presentation",children:[(0,s.jsx)(S.Z,{className:p().tooltipIcon}),
  (0,s.jsx)("span",{className:"sr-only",children:i})]})})};
var k=function(e){var i=e.tooltip,n=e.score,a=e.scoreType,d=e.totalPoints;return(0,s.jsxs)("div",{
  className:p().scoreCard,children:[(0,s.jsx)(N,{tooltip:i}),(0,s.jsx)("p",{className:p().scoreLabel,children:a}),
  (0,s.jsx)(_.Z,{score:n,totalPoints:d,className:p().score})]})};
```

and in `L`:

```js
(0,s.jsx)(k,{tooltip:d.B4.OVERALL_GRADE_TOOLTIP,scoreType:d.B4.OVERALL_GRADE,
   score: gradeOverview[0].finalGrade.gradeValue ?? "-"}),
(0,s.jsx)(k,{tooltip:d.B4.POINTS_EARNED_TOOLTIP,scoreType:d.B4.POINTS_EARNED,
   score:String(finalGrade.finalPoints ?? "-"), totalPoints:String(finalGrade.maxPoints ?? "-")}),
(0,s.jsx)(k,{tooltip:d.B4.PERCENTAGE_SCORE_TOOLTIP,scoreType:d.B4.PERCENTAGE, score:q})   // q = U.h(finalPoints??0, maxPoints??0)
```

The shared score display (68150), quoted whole because every number on the page goes through it:

```js
n.Z=function(e){var n=e.score,i=e.totalPoints,t=e.percentage,d=e.className,l=void 0===d?"":d,
 u=e.fromStudentFeedbackCard,c=void 0!==u&&u,
 m=n&&"-"!==n?n.includes("-"):null, v=n&&"-"!==n?null:o.B4.NO_SCORES;
 return(0,s.jsxs)("div",{className:"".concat(a().score," ").concat(l),children:[
  (0,s.jsxs)("span",{"data-testid":r.gradebook.studentScoredPoints,children:[null!==n&&void 0!==n?n:"-",
     m&&(0,s.jsx)("span",{className:"sr-only",children:"−"}),
     v&&(0,s.jsx)("span",{className:"sr-only",children:v})]}),
  i&&(0,s.jsxs)("div",{className:"".concat(c?a().points:a().pointsNumerator," ").concat(l),children:["/ ",
     (0,s.jsx)("span",{className:a().totalPoints,children:i}),
     t&&n&&(0,s.jsx)("span",{className:"".concat(a().totalPoints," ").concat(l),children:"(".concat(t,")")})]})]})}
```

So each score card renders:

```html
<div class="GradingScoreCard_scoreCard__YO7GJ">
  <div class="GradingScoreCard_tooltip__DbXVM" tabindex="0" role="presentation">
    <svg class="GradingScoreCard_tooltipIcon__e3lnT">…</svg><span class="sr-only">{tooltip}</span>
  </div>
  <p class="GradingScoreCard_scoreLabel__QfYiM">Overall Grade</p>
  <div class="Points_score__EWMIc GradingScoreCard_score__ZuuJn">
    <span data-testid="student_scored_points">A</span>
  </div>
</div>
```

Points Earned adds the denominator:
`<span data-testid="student_scored_points">182</span><div class="Points_pointsNumerator__cNFpA GradingScoreCard_score__ZuuJn">/ <span class="Points_totalPoints__0YI7s">200</span></div>`.
Percentage shows `<span data-testid="student_scored_points">91%</span>` and no denominator. When there is no
grade yet: Overall `"-"` plus `<span class="sr-only">No score</span>`; Points `"-"`/`"-"` only if the field is
null (a `0` renders as `0`); Percentage `"-"` when maxPoints is 0.

Note: the Overall card **is not gated on `isPublished`**; `isPublished` is fetched and never read here.

### Class card (1930), shown above the topics

`section.mb-2 > div.ClassModificationsHeader_courseUnitContainer__Q9hsc`, containing a collapsible header
(25173) whose `h5[data-testid="header"]` is the `classCode`, a date range (51518), and
`<span class="text-sm text-secondary md:text-lg">Max Points:</span><span class="pl-1 text-sm text-main md:text-lg">{maxPoints}</span>`
where `maxPoints` = sum of every unit's `assessments[].points` (lodash `round(…,2)` per unit, alternates
included). Expanding shows `h6[data-testid=courseName]`, credits `"{n} Credits"` and the course description
(test ids under `syllabus.syllabusHeader`; exact strings not looked up).

### Topic (unit) group (88370 `We`)

```js
(0,s.jsxs)("div",{className:Qe().topics,children:[
 (0,s.jsxs)("div",{className:Qe().topicHeader,children:[
   (0,s.jsx)(Ze.Z /*IconButton*/,{disableFocusRipple:!0,className:"".concat(Qe().topicToggle," ").concat(j.I$.WD),
      "aria-label":"".concat(i?d.Xx.COLLAPSE_ALL:d.Xx.EXPAND_ALL," ").concat(r," ").concat(d.Xx.ASSESSMENT),
      "aria-expanded":i,"aria-controls":r?.toLowerCase()??"",id:"".concat(d.Xx.ACCORDION,"_").concat(r?.toLowerCase()),
      onClick:n,children:(0,s.jsx)(ze.Z,{className:i?Qe().expandedIcon:Qe().icon})}),
   (0,s.jsxs)("div",{className:Qe().topicHeaderContent,children:[
     (0,s.jsxs)("div",{children:[(0,s.jsx)("h3",{id:p,className:Qe().topicTitle,children:r}),
        t&&(0,s.jsx)(Ve.Z /*Tag*/,{className:Qe().topicTag,children:(0,s.jsx)("span",{className:Qe().topicTagName,children:d.B4.CURRENT})}),
        (0,s.jsx)(le.Z /*Badge*/,{count:c,className:"flex-shrink-0 ml-3"})]}),
     (0,s.jsxs)("div",{className:"".concat(Qe().topicPoints," ").concat(j.I$.Oy),children:[
        (0,s.jsxs)("p",{children:[d.B4.POINTS,":"]}),
        (0,s.jsx)(_.Z,{score:o?.scored>-1?"".concat(o.scored):null,totalPoints:o?.total?"".concat(o.total):null,className:"flex"})]})]})]}),
 (0,s.jsx)(Le.Z /*Collapse*/,{in:i,children:(0,s.jsx)("div",{className:"".concat(Qe().topicContent," ").concat(i?j.I$.KW:""),
    "aria-labelledby":p,children:l})})]})
```

- Classes: `TopicGrouping_topics__LlBE9`, `_topicHeader__saa0_`, `_topicToggle__E4nv3`,
  `_topicHeaderContent__mIGOJ`, `_topicTitle__YvuqL`, `_topicTag__fMQsk` (+ `Tag_tag__SJmf6`),
  `_topicPoints__Nkb6I`, `_topicContent__r__xs`, `_expandedIcon__Eud4I`; `Qe().icon` and `Qe().topicTagName`
  are not in the map (render `undefined`).
- Badge (51547): `span.Badge_badge__rfDA1` with the count of PUBLISHED rows never viewed
  (`!userLastSeenDate`); renders nothing when 0.
- Topic "Points:" is **published-only**: `scored`/`total` sum only rows with `status === "PUBLISHED"` and
  `scored > -1`. A topic with nothing published has scored `0` and total `0`, so it renders
  `Points:` `<span data-testid="student_scored_points">0</span>` with no denominator (total 0 is falsy).
- Topic toggle `aria-label` = `"expand all {title} assessment"` / `"collapse all {title} assessment"`, `id` =
  `"accordion_{title lowercased}"` (lowercase `Xx` table: `ACCORDION:"accordion"`, `EXPAND_ALL:"expand all"`).
  `h3` id = `snakeCase("assessments_" + title)`, e.g. `assessments_topic_1`.

### Assessments: table (wide) or cards (narrow)

`Me` picks by window width (hook 88155, Halo's tailwind screens `sm 600px, md 1024px, ml 1366px`):
**if `window.innerWidth < 1366` and there are rows, it renders cards (`je`), otherwise the LMSTable.**
A content script must handle both.

Rows are each unit's assessments, sorted by 34590 `kZ`: by `dueDate` ascending, then within the same due date by
type order DISCUSSION_QUESTION, ASSIGNMENT, LTI, QUIZ, PARTICIPATION, then `title`, `id`.

**Table** (42800) with `className: "AssessmentTable_table__doBdl guide_anchor_studentGradebook_assessmentTable"`,
`title: "Assessments for {unitTitle}"`, `disableSorting: true`, columns for the student view:

| Header | accessor | width | Cell |
| --- | --- | --- | --- |
| "Assessment Type" (`className: "sr-only"`) | icon | 1rem | `span.AssessmentTable_assessmentIcon__Ujgb_ > span.CheckIcon_icon__m6WyH.AssessmentTable_checkIcon__TdV2v > svg(circle) [+ check icon when LATE/SUBMITTED/PUBLISHED] + span.CheckIcon_content__BxrUJ > type icon` |
| "Assessment" (`className: guide_anchor_studentGradebook_assessmentColumn`) | assessment | 12rem | `div.AssessmentTable_gradingFeedback__OTaKQ.guide_anchor_studentGradebook_feedbackContainer > h4.AssessmentTable_assessmentTitle__1zTyD` = title |
| "Due Date" | dueDate | 10rem | `Ce` time + optional accommodated date |
| "Submission Date" | submissionDate | 10rem | `Ce` time, or `-` |
| "Status" | status | 3rem | status badge |
| "Score" | score | 12rem | 68150 with score/total/percent |
| "Action" | action | 12rem | `div.flex.items-center > Ne` + eye icon in `span.guide_anchor_studentGradebook_viewFeedback` |

LMSTable markup:

```
div.MuiTableContainer-root.MuiPaper-root.LMSTable_table__GMbjo.AssessmentTable_table__doBdl.guide_anchor_studentGradebook_assessmentTable
 └─ table.MuiTable-root[aria-label="Assessments for Topic 1"][data-testid="lms_table_container"]
     ├─ thead > tr.LMSTable_headerRow__oOFwD[data-testid="lms_table_header_row"]
     │    └─ th[data-testid="lms_table_header_col_"]  (suffix is snakeCase(columnTitle()), columnTitle returns "" → all "lms_table_header_col_")
     │         > div > span.MuiTableSortLabel-root (role="none", hideSortIcon) > span[class=column.className] {Header}
     └─ tbody[data-testid="lms_table_body_container"]
          └─ tr.LMSTable_row__edtG3.LMSTable_striped__C40Jx[data-testid="lms_table_body_row_row_0"]
               └─ td[data-testid="lms_table_body_col_cell_0_icon"] > span[style] > {cell}
```

The row/cell test-id suffixes are react-table keys: `getRowProps().key` is `row_<index>`,
`getCellProps().key` is `cell_<rowIndex>_<accessor>` (react-table v7 defaults; the library code itself is not
quoted here). So the score cell is `td[data-testid="lms_table_body_col_cell_<i>_score"]`. Row index restarts at
0 in each topic's table.

**Narrow card** (`Ue`), per row:

```
div.py-1
 └─ div (odd index: "studentFeedbackCard_cardColor__0R03b border rounded"; even: " border rounded studentFeedbackCard_bgcardColor__7H_9p")
     ├─ label/value pair (38112): div.flex > div.font-display-regular.text-gray5E.text-sm.StudentAssessmentDetails_childItem__D0eWn "Assessment"
     │                                      + div.StudentAssessmentDetails_childItem__D0eWn > div.flex > icon + div > span.ml-3.text-hyperlink.studentFeedbackCard_wordBreak__TZpNT {title}
     ├─ "Due Date"       → Ce.studentFeedbackCard_dueDate__bXzaS
     ├─ "Submitted Date" → Ce.studentFeedbackCard_submissionDate__vbbTp       (note: "Submitted", not "Submission")
     ├─ "Status"         → div.text-sm.font-display-regular.text-main > badge.studentFeedbackCard_gradeStatusBadge__kn8EC
     ├─ "Score"          → div.flex > 68150 with fromStudentFeedbackCard (denominator wrapper class is a().points — not in the Points map → "undefined")
     └─ "Action"         → childClass quizBtn | btnPadding > div.flex.items-center > Ne
```

The card's title is a `span`, not the `h4` the table uses.

### Status badge (48133)

```js
(0,r.jsx)("div",{tabIndex:-1,"aria-label":h??"".concat(n),"data-testid":c.assignmentPage.assessmentHeader.status,
  style:p,className:"".concat(l().gradeStatusTag," ").concat(u),children:(n??"").split("_").map(o.capitalize).join(" ")})
```

Note `ariaLabel` defaults to `""`, and `"" ?? x` is `""`, so the badge has `aria-label=""`. Text is the status
capitalized: `Published`, `Submitted`, `Late`, `Overdue`, `Active`, `Upcoming`, `Reassigned`, `In Progress`.
Classes `GradeStatusBadge_gradeStatusTag__7VYU1 AssessmentTable_gradeStatusBadge__ixE96`. Inline colours:
PUBLISHED white on `var(--lms-published)`; REASSIGNED white on `--lms-reassigned`; LATE text-primary on
`--lms-late`; OVERDUE white on `--lms-overdue`; SUBMITTED white on `--lms-ungraded`; IN_PROGRESS on
`--lms-inProgress`; ACTIVE on `--lms-upcoming`; UPCOMING/default text-primary on `--lms-grayE0`. A row with no
grade record gets status `UPCOMING`. Its test id `assignmentPage.assessmentHeader.status` resolves to
`"status"` (first `assessmentHeader` after `assignmentPage` in 1978), so `[data-testid="status"]`; generic, shared with the
assignment page.

### Dates (`Ce`)

```js
if(!i) return fallback "-";  …  return (0,s.jsxs)("time",{className:d,dateTime:o.toISOString(),children:[
  (0,s.jsxs)("span",{className:we().dateWithPrefix,children:[n,(0,s.jsx)("span",{children:l})]})," ",
  (0,s.jsx)("span",{className:we().timePart,children:u})]})
```

`l = format("MMM D, YYYY") + ","`, `u = format("h:mm A")`, e.g. `<time datetime="…"><span class="FormattedDateTimeDisplay_dateWithPrefix__J5WrS"><span>Oct 5, 2026,</span></span> <span class="FormattedDateTimeDisplay_timePart__UdluQ">11:59 PM</span></time>`.
A reassigned row has a prefix icon (64303 `Xw`) inside `dateWithPrefix`. Accommodated due date (55857):
`div.mt-1.text-sm.text-gray21` with a tooltip icon, sr-only `", Accommodated Due Date, "`, date and time.

### Action button (88370 `Ne`)

For the student view (`studentGradebookViewOnly`), the label by type and status:
ASSIGNMENT: REASSIGNED/OVERDUE/ACTIVE and not in person → "Submit Assignment"; LATE/OVERDUE/SUBMITTED → "View
Submission"; PUBLISHED → "View Feedback". DISCUSSION_QUESTION: REASSIGNED/OVERDUE/ACTIVE → "Submit DQ Response";
LATE/SUBMITTED → "View response"; PUBLISHED → "View Feedback". PARTICIPATION: ACTIVE/OVERDUE → "Go to Discussion";
PUBLISHED → "View Feedback". QUIZ: ACTIVE/IN_PROGRESS/SUBMITTED/LATE/OVERDUE/REASSIGNED → "Go to Quiz"; PUBLISHED →
"View Feedback". LTI: ACTIVE/OVERDUE/REASSIGNED/LATE/SUBMITTED → "Open Assignment"; PUBLISHED → "View Feedback".
Otherwise null → an empty `<span data-testid="student_Assessment_Status_Button=<assessmentId>">`.

When there is a label:

```
div.flex.items-center.  > div > (Tooltip) span >
  button.MuiButton-root.MuiButton-(contained|outlined)Secondary.MuiButton-sizeSmall.AssessmentTable_assessmentStatusBtn__64aCu
     [aria-label="{title}{label}"] [data-testid="student_Assessment_Status_Button=<assessmentId>"]  {label}
  + span.Badge_badge__rfDA1.ml-2 "1"   when PUBLISHED and never viewed
```

`variant` is `"outlined"` once `userLastSeenDate` is set, otherwise `"contained"`. The test id helper (66220) is
`"".concat(e,"=").concat(t)`, so the assessment id is embedded: **`student_Assessment_Status_Button=<uuid>` is
the only per-row id-bearing attribute on the page.** After it, when `userLastSeenDate` is set:
`span.guide_anchor_studentGradebook_viewFeedback > (tooltip "Viewed {fromNow}") svg`.

## 3. How numbers are computed and formatted

- Percent helper (21051), used everywhere:

```js
function t(e,n){var i=e/n*100;return isNaN(i)||i<0||i===1/0?"-":"".concat((0,s.round)(i,2),"%")}
```

  lodash `round` to 2 decimals, no fixed padding: `91%`, `91.5%`, `91.53%`; `-` for 0/0, negative or ∞.
- **Overall Grade** = `finalGrade.gradeValue` verbatim (the letter Halo's server computed, e.g. `A`, `B+`), `-`
  if null. No client computation.
- **Points Earned** = `String(finalGrade.finalPoints)` `/ ` `String(finalGrade.maxPoints)` verbatim, no rounding.
  Per the tooltip, maxPoints is the total of *published* assessments, so it is not the class's Max Points.
- **Percentage** = `h(finalPoints ?? 0, maxPoints ?? 0)`, computed on the client.
- **Per row** (`qe`): `total = round(assessment.points ?? 0, 2)`. Only when `status === "PUBLISHED"`:
  `scored = finalPoints != null ? round(finalPoints, 2) : -1`, `percent = h(scored, total)`.
  Display: published → `"{scored}"` `/ {total}` `({percent})`, e.g. `<span data-testid="student_scored_points">45</span><div class="Points_pointsNumerator__cNFpA AssessmentTable_score__Exj27">/ <span class="Points_totalPoints__0YI7s">50</span><span class="Points_totalPoints__0YI7s AssessmentTable_score__Exj27">(90%)</span></div>`.
  Not published (or published with null points) → `-` + sr-only `No score`, then `/ 50` (the total still shows,
  no percent).
- **Topic Points** = sum of published rows only (see above), via the same display without percent.
- **Class card Max Points** = sum of all assessment points across units.

## 4. Weights, drops, extra credit, exempt

None in this page. Neither the gradebook module nor any route chunk mentions `weight` (except CSS
font-weight), `category`, `drop`, `dropLowest`, `extraCredit` or `exempt` as grade fields. `GradeOverview` asks
for none. The only related concepts:
- `isAlternate` / `parentId` (alternate assessments). On the student view they only affect nothing visible:
  the "base/alternate" label (67853) is shown only when `Z.Z()` (19127) says the user's role is INSTRUCTOR.
  Alternates are included in the class card's Max Points.
- `EXEMPT` / `EXEMPT_ACCOMMODATION` / `exemptAccommodations` strings exist elsewhere in the app bundle
  (instructor-side accommodation tooltips, `EXEMPT_FROM_ATTENDANCE` participation status). Not on this page.
So Halo's student gradebook is pure points: earned / possible over published work, with a server letter grade.

## 5. Selectors for a content script

Use test ids and Halo's `guide_anchor_*` classes first (both are plain strings, stable across builds); fall
back to CSS-module prefixes with `[class*="AssessmentTable_title"]`-style matches, never the hash suffix.

| Target | Selector |
| --- | --- |
| Page ready | `.guide_anchor_studentGradebook_progress` (the progress cards `section`) |
| Overall grade (letter) | the score card whose `[class*="GradingScoreCard_scoreLabel"]` text is `Overall Grade`, then its `[data-testid="student_scored_points"]`. Within the progress section the cards are in fixed order: `section.guide_anchor_studentGradebook_progress [class*="GradingScoreCard_scoreCard"]` → [0] Overall Grade, [1] Points Earned, [2] Percentage |
| Points earned / max | card [1]: `[data-testid="student_scored_points"]` (earned) + `[class*="Points_totalPoints"]` (max) |
| Topic group | `[class*="TopicGrouping_topics"]`; title `h3[class*="TopicGrouping_topicTitle"]`; points `.guide_anchor_studentGradebook_topicPoints [data-testid="student_scored_points"]` |
| Assessment row (table) | `.guide_anchor_studentGradebook_assessmentTable tbody tr[data-testid^="lms_table_body_row_"]` |
| Assessment row (card, < 1366px) | `[class*="studentFeedbackCard_cardColor"], [class*="studentFeedbackCard_bgcardColor"]` |
| Row id (both layouts) | `[data-testid^="student_Assessment_Status_Button="]` → split on `=`; present on every row, even with no button (empty span) |
| Row title | table: `h4[class*="AssessmentTable_assessmentTitle"]`; card: `span[class*="studentFeedbackCard_wordBreak"]` |
| Row score cell | table: `td[data-testid$="_score"]`; inside: earned `[data-testid="student_scored_points"]`, possible first `[class*="Points_totalPoints"]`, percent second `[class*="Points_totalPoints"]` |
| Row status | `[data-testid="status"]` or `[class*="GradeStatusBadge_gradeStatusTag"]`, text |
| Ungraded row | status badge text ≠ `Published`, or the scored span's text is `-` (it contains a `.sr-only` "No score"; read the first text node, not `textContent`, which would give `-No score`) |

Gotchas: the page re-renders on data load (no-cache query) and on expand/collapse. Topics collapse with MUI
`Collapse`, which by default keeps children mounted (height 0), so rows should exist while collapsed; not verified
on a live page. Each topic has its own table, so row indices repeat. `textContent` of the score span includes sr-only
text (`−` for negatives, `No score`).
