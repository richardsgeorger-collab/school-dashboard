// Halo capture helper — Step 1 of Halo sync.
// Paste the whole file into the DevTools Console on https://halo.gcu.edu while logged in.
// It reads your session the same way Halo's own app does, runs the two read-only queries
// the sync will use, redacts every token, and downloads halo-capture.json.
// Nothing is sent anywhere except to Halo's own gateway. No token is stored or printed.
(async () => {
  const out = { capturedAt: new Date().toISOString(), page: location.href, tz: Intl.DateTimeFormat().resolvedOptions().timeZone };
  const secrets = [];
  const redact = (v) => (typeof v === 'string' && v.length > 12 ? `<redacted ${v.slice(0, 6)}… len=${v.length}>` : v);

  // 1. Session: Halo's app reads authToken/contextToken from here.
  let session = {};
  try {
    const r = await fetch('/api/auth/session', { credentials: 'include' });
    session = await r.json();
  } catch (e) { out.sessionError = String(e); }
  out.sessionKeys = Object.keys(session);
  out.session = Object.fromEntries(Object.entries(session).map(([k, v]) => [k, /token/i.test(k) ? redact(v) : v]));
  for (const [k, v] of Object.entries(session)) if (/token/i.test(k) && typeof v === 'string') secrets.push(v);

  // 2. Cookie fallback check (names are base64 of LMS_AUTH / LMS_CONTEXT). Values never printed.
  const cookieNames = document.cookie.split(';').map((c) => c.trim().split('=')[0]);
  out.cookies = { LMS_AUTH_readable: cookieNames.includes('TE1TX0FVVEg'), LMS_CONTEXT_readable: cookieNames.includes('TE1TX0NPTlRFWFQ') };

  const auth = session.authToken, ctx = session.contextToken;
  if (!auth || !ctx) {
    out.verdict = 'Session endpoint did not return authToken/contextToken. Stop here and paste this file back.';
  } else {
    const gql = async (operationName, query, variables) => {
      const r = await fetch('https://gateway.halo.gcu.edu/', {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + auth,
          ContextToken: 'Bearer ' + ctx,
          'transaction-id': crypto.randomUUID(),
        },
        body: JSON.stringify({ operationName, variables, query }),
      });
      return { status: r.status, json: await r.json().catch(() => null) };
    };

    // 3. Classes with units and assessments (the query BetterHalo has used in production).
    out.classes = await gql('getCourseClassesForUser', `query getCourseClassesForUser($pgNum: Int, $pgSize: Int) {
  getCourseClassesForUser(pgNum: $pgNum, pgSize: $pgSize) {
    courseClasses { id classCode slugId startDate endDate name stage modality credits courseCode version sectionId
      units { id title sequence startDate endDate current points
        assessments { id sequence title description startDate dueDate points type tags requiresLopesWrite isGroupEnabled inPerson } } } } }`, { pgNum: 1, pgSize: 50 });

    // 3b. Extra fields Halo's own app requests; allowed to fail.
    out.extended = await gql('getCourseClassesForUser', `query getCourseClassesForUser($pgNum: Int, $pgSize: Int) {
  getCourseClassesForUser(pgNum: $pgNum, pgSize: $pgSize) {
    courseClasses { id slugId courseCode
      units { id assessments { id parentId isAlternate alternateType attachments { id title } } } } } }`, { pgNum: 1, pgSize: 50 });

    // 4. Per-class grade/status rows (comments and attachments stripped).
    out.grades = {};
    const classes = out.classes.json?.data?.getCourseClassesForUser?.courseClasses ?? [];
    for (const c of classes) {
      const g = await gql('AllAssessmentGrades', `query AllAssessmentGrades($courseClassSlugId: String!, $courseUnitId: String) {
  assessmentGrades: getAllClassGrades(courseClassSlugId: $courseClassSlugId, courseUnitId: $courseUnitId) {
    grades { id status dueDate accommodatedDueDate userLastSeenDate isEverReassigned
      assessment { id inPerson } assignmentSubmission { submissionDate } userQuizAssessment { userQuizId }
      history { status points } } } }`, { courseClassSlugId: c.slugId, courseUnitId: null });
      out.grades[c.courseCode + ' ' + c.slugId] = g;
    }
    out.verdict = 'ok';
  }

  let text = JSON.stringify(out, null, 2);
  for (const s of secrets) text = text.split(s).join('<REDACTED>');
  const blob = new Blob([text], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'halo-capture.json' });
  document.body.appendChild(a); a.click(); a.remove();
  try { await navigator.clipboard.writeText(text); } catch {}
  console.log('halo-capture.json downloaded (' + Math.round(text.length / 1024) + ' KB). Verdict: ' + out.verdict);
})();
