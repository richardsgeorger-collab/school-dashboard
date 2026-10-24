// The demo student (Maya Torres, made up) for the GPA test (scripts/e2e-gpa.mjs), with UNV-103 not graded yet, and the
// GPA the domain code works out for it (src/domain/gpa.ts, itself checked against hand-worked examples in gpa.test.ts).
// Prints JSON: { demo, expect: { gpa, credits, ungraded, rows } }.
//   npx tsx scripts/gpa-fixture.ts
import { demoStudent } from '../src/demo/student';
import { semesterGpa } from '../src/domain/gpa';

const demo = demoStudent(new Date().toISOString());
const unv = demo.data.courses.find((c) => c.code === 'UNV-103');
if (unv) unv.haloGrade = null;
const g = semesterGpa(demo.data.courses);
const chm = demo.data.courses.find((c) => c.code === 'BIO-181')!;
const what = semesterGpa(demo.data.courses, { [chm.id]: 80 });
const twoCredits = semesterGpa(demo.data.courses.map((c) => (c.id === chm.id ? { ...c, credits: 2, creditsFrom: 'student' as const } : c)));
process.stdout.write(JSON.stringify({ demo, expect: { gpa: g.gpa, credits: g.credits, ungraded: g.ungraded, rows: g.rows, whatIfBio80: what.gpa, bioId: chm.id, bioTwoCredits: twoCredits.gpa } }));
