// The state the user actually has, rebuilt from what they reported: 13 items due today across six classes, 32
// announcement parts carrying every failure they named (the same topic claim four times, restatements of the item's
// own title, standing class rules dated as if they were tasks), five participation items, and four done items
// interleaved with the open ones. Used by the screenshot script and by the e2e, so both exercise the real shape.

export const TODAY = '2026-09-20';
// A GCU deadline of "due Sep 20" is 11:59pm Phoenix on the 20th, which is 06:59Z on the 21st.
const iso = (d, t = '23:59') => new Date(`${d}T${t}:00-07:00`).toISOString();
const flags = { inClass: false, group: false, lopesWrite: false, timed: false, practice: false };

export const CLASSES = [
  { code: 'CHM-113', name: 'General Chemistry I-Lecture', color: '#6fb3c9' },
  { code: 'CHM-113L', name: 'General Chemistry I-Lab', color: '#7fc4a8' },
  { code: 'ENG-105', name: 'English Composition I', color: '#d89a6a' },
  { code: 'ESG-162', name: 'Engineering Mathematics I', color: '#a99ae0' },
  { code: 'ESG-162L', name: 'Engineering Mathematics I-Lab', color: '#d68fa8' },
  { code: 'UNV-106', name: 'University On-Campus Success', color: '#c9c06f' },
];

/** One requirement. `src` is the announcement it came from, so duplicates across posts are visible. */
const req = (id, text, o = {}) => ({
  id,
  text,
  dueAt: o.due ? iso(o.due, o.time ?? '23:59') : null,
  done: o.done ?? false,
  doneAt: null,
  gradedOn: o.graded ?? true,
  redefinesDone: o.redefines ?? false,
  addedAt: iso('2026-09-18', '12:00'),
  source: { kind: 'announcement', id: o.src ?? 'ann-x', title: o.post ?? 'Week 2 reminders', quote: o.quote ?? text.toLowerCase(), at: iso(o.postedOn ?? '2026-09-14', '15:00') },
});

/** The items, with the requirement pile exactly as reported. */
export function items(courseIdByCode) {
  const C = courseIdByCode;
  const mk = (o) => ({
    label: o.label,
    type: o.type ?? 'homework',
    points: o.points ?? 10,
    status: o.status ?? 'todo',
    score: o.score ?? null,
    estimatedMinutes: o.est ?? 45,
    estimateOverridden: false,
    dueAt: iso(o.due ?? TODAY, o.time ?? '23:59'),
    flags,
    requirements: o.reqs ?? [],
    id: o.id,
    courseId: C[o.code],
    title: o.title,
    createdAt: iso('2026-09-08', '12:00'),
    updatedAt: iso('2026-09-18', '12:00'),
  });

  return [
    // ENG-105: the duplication the user called out, plus standing rules dated as tasks.
    mk({ id: 'apa-quiz', code: 'ENG-105', title: 'APA Quiz 1', label: 'English Quiz 1', type: 'quiz', points: 20, est: 30, reqs: [
      req('r1', 'Complete APA Quiz 1, due Sep 20', { src: 'a1', post: 'Week 2 checklist', due: TODAY }),
      req('r2', 'Complete APA Quiz 1 by Sunday (2026-09-20)', { src: 'a2', post: 'Reminder: quiz', due: TODAY }),
      req('r3', 'Submit one PDF only, no handwriting', { src: 'a3', post: 'Formatting rules' }),
      req('r4', 'Late work receives zero points', { src: 'a3', post: 'Formatting rules' }),
    ] }),
    mk({ id: 'rhet', code: 'ENG-105', title: 'Rhetorical Analysis Pre-writing', label: 'English Paper 1', type: 'paper', points: 50, est: 120, reqs: [
      req('r5', 'Choose your Rhetorical Analysis topic', { src: 'a1', post: 'Week 2 checklist', due: TODAY }),
      req('r6', 'Choose your topic for the Rhetorical Analysis', { src: 'a4', post: 'Topic selection' }),
      req('r7', 'Pick a Rhetorical Analysis topic before Sunday', { src: 'a5', post: 'Week 2 wrap-up', due: TODAY }),
      req('r8', 'Use the APA 7 student paper template posted in Resources', { src: 'a3', post: 'Formatting rules' }),
      req('r9', 'Cite two peer-reviewed sources from the GCU library', { src: 'a4', post: 'Topic selection' }),
    ] }),
    mk({ id: 'eng-dq1', code: 'ENG-105', title: 'Topic 2 DQ 1', label: 'English DQ 2.1', type: 'discussion', points: 5, est: 30, reqs: [
      req('r10', 'Every DQ post must be 150-200 words', { src: 'a6', post: 'Discussion expectations' }),
      req('r11', 'Post 2 peer replies on 3 separate days', { src: 'a6', post: 'Discussion expectations' }),
      req('r12', 'Reply to two classmates by Sunday night', { src: 'a5', post: 'Week 2 wrap-up', due: TODAY, redefines: true }),
    ] }),
    mk({ id: 'eng-dq2', code: 'ENG-105', title: 'Topic 2 DQ 2', label: 'English DQ 2.2', type: 'discussion', points: 5, est: 30, reqs: [
      req('r13', 'Every DQ post must be 150-200 words', { src: 'a6', post: 'Discussion expectations' }),
      req('r14', 'Post 2 peer replies on 3 separate days', { src: 'a6', post: 'Discussion expectations' }),
    ] }),

    // CHM-113L: the same topic claim, four times, differently worded.
    mk({ id: 'chem-conn', code: 'CHM-113L', title: 'Chemistry Connections', label: 'Chem Lab Project 1', type: 'project', points: 25, est: 90, reqs: [
      req('r15', 'Go to the Discussion Forum thread and claim your topic', { src: 'a7', post: 'Claim your topic', due: TODAY }),
      req('r16', 'Do not choose a topic already claimed by a classmate', { src: 'a7', post: 'Claim your topic' }),
      req('r17', 'Go to the Discussion Forum thread to claim a topic', { src: 'a8', post: 'Topic claims close Sunday', due: TODAY }),
      req('r18', 'Do not pick a topic another student has already claimed', { src: 'a8', post: 'Topic claims close Sunday' }),
      req('r19', 'Bring safety goggles to Thursday lab', { src: 'a9', post: 'Lab week 3', due: '2026-09-24', time: '16:00' }),
    ] }),
    mk({ id: 'chem-prac', code: 'CHM-113', title: 'Practice Quiz 1', label: 'Chem Practice 1', type: 'quiz', points: 20, est: 30, reqs: [
      req('r20', 'Complete and submit Practice Quiz 1 by Sunday', { src: 'a10', post: 'ALEKS this week', due: TODAY }),
    ] }),
    mk({ id: 'chem-hw', code: 'CHM-113', title: 'Topic 1 Homework', label: 'Chem Homework 1', type: 'homework', points: 10, est: 60 }),

    // ESG-162: already graded, which the coach was reporting as still due.
    mk({ id: 'esg-rev', code: 'ESG-162', title: 'Eng Math Review 1', label: 'Math Review 1', type: 'homework', points: 25, est: 45, status: 'done', score: 13.67, due: '2026-09-19' }),
    mk({ id: 'esg-quiz', code: 'ESG-162', title: 'Topic 1 Quiz', label: 'Math Quiz 1', type: 'quiz', points: 50, est: 60, due: '2026-09-21', time: '07:00' }),
    mk({ id: 'esgl-sched', code: 'ESG-162L', title: 'Scheduling Assignment', label: 'Math Lab 1', type: 'homework', points: 30, est: 75, reqs: [
      req('r21', 'Submit one PDF only, no handwriting', { src: 'a3', post: 'Formatting rules' }),
    ] }),
    mk({ id: 'unv-dq', code: 'UNV-106', title: 'Topic 2 DQ 1', label: 'Success DQ 2.1', type: 'discussion', points: 5, est: 30, reqs: [
      req('r22', 'Reply to at least two classmates', { src: 'a11', post: 'Replies count', due: TODAY, redefines: true }),
      req('r23', 'Every DQ post must be 150-200 words', { src: 'a6', post: 'Discussion expectations' }),
    ] }),
    mk({ id: 'unv-ai', code: 'UNV-106', title: 'AI-Assisted Career Reflection', label: 'Success Paper 1', type: 'paper', points: 100, est: 150, due: '2026-09-28' }),

    // Five participation items due today, all full-size cards today.
    ...CLASSES.slice(0, 5).map((c, n) =>
      mk({ id: `part-${n}`, code: c.code, title: 'Week 2 Participation', label: `${c.code.split('-')[0]} Participation 2`, type: 'participation', points: c.code === 'UNV-106' ? 20 : 10, est: 0, reqs: n === 0 ? [req(`rp${n}`, 'Post on three separate days to earn full participation', { src: 'a6', post: 'Discussion expectations' })] : [] }),
    ),

    // Four done items sitting among today's open work.
    mk({ id: 'done-1', code: 'CHM-113', title: 'Week 1 Participation', label: 'Chem Participation 1', type: 'participation', points: 10, status: 'done', score: 10 }),
    mk({ id: 'done-2', code: 'ENG-105', title: 'Topic 1 DQ 2', label: 'English DQ 1.2', type: 'discussion', points: 5, status: 'done', score: 5 }),
    mk({ id: 'done-3', code: 'UNV-106', title: 'Microsoft Office 365 Quiz', label: 'Success Quiz 2', type: 'quiz', points: 60, status: 'done', score: 57 }),
    mk({ id: 'done-4', code: 'CHM-113L', title: 'Lab Safety Contract', label: 'Chem Lab Admin 1', type: 'other', points: 5, status: 'done', score: 5 }),
  ];
}

/** Writes the whole shape into the live store's slot and returns what it wrote. */
export function seedScript() {
  return `(() => {
    const raw = JSON.parse(localStorage.getItem('school-dashboard:v1'));
    const byCode = {};
    for (const c of ${JSON.stringify(CLASSES)}) {
      const hit = raw.courses.find((x) => x.code === c.code);
      if (hit) { byCode[c.code] = hit.id; continue; }
      const id = 'c-' + c.code.toLowerCase().replace(/[^a-z0-9]/g, '');
      raw.courses.push({ ...(raw.courses[0] ?? {}), id, code: c.code, name: c.name, color: c.color, notes: [] });
      byCode[c.code] = id;
    }
    raw.items = (${items.toString()})(byCode);
    localStorage.setItem('school-dashboard:v1', JSON.stringify(raw));
    return { courses: raw.courses.length, items: raw.items.length, parts: raw.items.reduce((n, i) => n + (i.requirements ?? []).length, 0) };
  })()`;
}
