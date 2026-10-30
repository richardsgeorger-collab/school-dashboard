// A CHM-113-like class for the what-if pictures and tests (2026-10-29, George: "in CHM-113 it lists 23 cards of equal
// size, and Exam 1, worth 1.5% per 10%, gets lost among participation posts worth 0.1%"). Made up, added to the demo
// student Maya Torres's data on this device only (demo mode never reaches the server): Halo's grade 92.0% (A-) on 300
// points graded; still to come, Exam 1 tomorrow (60 points), a quiz, two labs and a lab report, and many small things
// (participation posts, homework, activities, 2 to 5 points each). 23 open items in all.
const DAY = 86_400_000;
const at = (days, hm = '23:59') => {
  const d = new Date(Date.now() - 7 * 3_600_000 + days * DAY).toISOString().slice(0, 10);
  return new Date(`${d}T${hm}:00-07:00`).toISOString();
};
export function chemClass() {
  const id = 'demo-chm-113';
  const course = {
    id, code: 'CHM-113', name: 'General Chemistry I', color: '#0E7C86', credits: 4, instructors: [{ name: 'Dr. Lena Ortiz', email: 'ortiz@example.edu' }], meetings: [], online: false,
    haloClassId: 'demo-halo-CHM-113', haloSlugId: 'CHM-113-MW1000A-20260908',
    haloGrade: { letter: 'A-', points: 276, maxPoints: 300, percent: 92, at: new Date(Date.now() - 20 * 60_000).toISOString() },
    gradeScale: [
      { label: 'A', minPercent: 93, maxPercent: 100 }, { label: 'A-', minPercent: 90, maxPercent: 92.99 }, { label: 'B+', minPercent: 87, maxPercent: 89.99 }, { label: 'B', minPercent: 83, maxPercent: 86.99 },
      { label: 'B-', minPercent: 80, maxPercent: 82.99 }, { label: 'C+', minPercent: 77, maxPercent: 79.99 }, { label: 'C', minPercent: 70, maxPercent: 76.99 }, { label: 'D', minPercent: 60, maxPercent: 69.99 }, { label: 'F', minPercent: 0, maxPercent: 59.99 },
    ],
    termStart: '2026-09-08', termEnd: '2026-12-20', updatedAt: new Date().toISOString(),
  };
  let n = 0;
  const item = (title, type, points, days, score = null, hm) => ({
    id: `${id}-i${n++}`, courseId: id, title, label: title, labelOverridden: false, type, points, opensAt: null, dueAt: at(days, hm), estimatedMinutes: 30, estimateOverridden: false, startByOverride: null,
    status: score === null ? 'todo' : 'done', completedAt: score === null ? null : at(days), score, notes: '', topic: null, flags: { inClass: false, group: false, lopesWrite: false, timed: false, practice: false },
    source: 'halo', haloId: `h-chm-${n}`, scoreSource: score === null ? null : 'halo', award: null,
  });
  const items = [
    // Graded (Halo's 276 of 300).
    item('Quiz 1: Measurement', 'quiz', 25, -30, 23), item('Lab 1: Density', 'lab', 30, -28, 28), item('Lab 2: Separations', 'lab', 30, -21, 27), item('Quiz 2: Atoms and Moles', 'quiz', 25, -14, 22),
    item('Problem Set 1', 'homework', 40, -24, 38), item('Problem Set 2', 'homework', 40, -10, 36), item('Lab 3: Stoichiometry', 'lab', 30, -7, 28), item('Topic 1 Participation', 'participation', 20, -20, 20),
    item('Topic 2 Participation', 'participation', 20, -12, 18), item('Lab Safety Quiz', 'quiz', 40, -35, 36),
    // Still to come: the exam tomorrow, the big ones, and many small ones.
    item('Exam 1', 'exam', 60, 1, null, '10:00'), item('Quiz 3: Reactions', 'quiz', 25, 6), item('Lab 4: Titration', 'lab', 30, 3), item('Lab 5: Gas Laws', 'lab', 30, 10), item('Formal Lab Report 1', 'paper', 50, 13),
    ...Array.from({ length: 8 }, (_, i) => item(`Topic 3 Participation: Day ${i + 1}`, 'participation', 2, i % 7)),
    ...Array.from({ length: 5 }, (_, i) => item(`Homework 3.${i + 1}`, 'homework', 5, 2 + i * 2)),
    ...Array.from({ length: 5 }, (_, i) => item(`In-class Activity ${i + 1}`, 'other', 3, 1 + i * 3)),
  ];
  return { course, items };
}

/** Adds the class to the demo student's data on this page, then reloads so the app reads it. */
export async function addChem(page) {
  const { course, items } = chemClass();
  await page.evaluate(({ course, items }) => {
    const key = 'school-dashboard:v1:demo';
    const d = JSON.parse(localStorage.getItem(key) || '{}');
    d.courses = [...(d.courses || []).filter((c) => c.id !== course.id), course];
    d.items = [...(d.items || []).filter((i) => i.courseId !== course.id), ...items];
    localStorage.setItem(key, JSON.stringify(d));
  }, { course, items });
  await page.reload({ waitUntil: 'load' });
  return course;
}
