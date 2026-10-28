// Feature 8: "Did it go through?"
// - On a topic page, Halo shows a handed-in assignment's state on its card (its check and its "Submitted" or "Late"
//   chip) but not when it was sent or which file it has: those appear only inside the assignment ("Submitted on …" and
//   the Submitted Files table; research 2026-10-27). 0.12.1 (George: "Halo already shows submission status ... only keep
//   anything Halo truly doesn't show"): Halo+ adds only those two, in small text under Halo's own chip: "Sun 3:12 PM ·
//   essay.docx", from Halo's submission record (the files Halo marks final, its submission time, in Halo's zone).
// - Before submitting, in the assignment's own view, a file that is clearly another type than the one the instructions
//   ask for gets one quiet line under it. Only when the instructions name exactly one file type for the submission
//   (logic.js requiredType) and the file's name ends in another one; any doubt, nothing.
(function () {
  'use strict';
  const O = globalThis.HaloPlusOn;
  const L = globalThis.HaloPlusOnLogic;
  if (!O || !L) return;
  const Q_SUB = 'query AssignmentSubmission($courseClassAssessmentId:String!){assignmentSubmission:getUserAssignmentSubmissionForAssessment(courseClassAssessmentId:$courseClassAssessmentId){id status submissionDate resources{isFinal resource{name}}}}';
  const Q_ONE = 'query CourseClassAssessment($assessmentId:String!){assessment:getCourseClassAssessmentById(id:$assessmentId){id title description type}}';
  const KIND = { docx: 'a Word document (.docx)', pdf: 'a PDF (.pdf)', pptx: 'a PowerPoint (.pptx)', xlsx: 'an Excel file (.xlsx)' };
  const MAX_CARDS = 4;

  // ---- the confirmation on the topic page ---------------------------------------------------------------------------------
  const done = new WeakSet();
  function when(t) {
    const z = O.zone();
    if (!z || !Number.isFinite(t)) return null;
    return Date.now() - t < 6 * 86_400_000 ? L.haloFormat(t, z, 'day') : L.haloFormat(t, z, 'short');
  }
  async function confirm(c) {
    done.add(c.card);
    let d;
    try {
      d = await O.ask('AssignmentSubmission', Q_SUB, { courseClassAssessmentId: c.id }, 30 * 60_000);
    } catch {
      return;
    }
    const s = d && d.assignmentSubmission;
    const t = s && Date.parse(s.submissionDate || '');
    const files = ((s && s.resources) || []).filter((r) => r && r.isFinal && r.resource && r.resource.name).map((r) => r.resource.name);
    const at = when(t);
    if (!at || !files.length || !c.card.isConnected) return;
    // Under Halo's own status chip, in its Status cell.
    const chip = c.card.querySelector('[data-testid="status"]');
    const cell = chip && chip.parentElement;
    if (!cell || cell.querySelector('[data-haloplus="submitted"]')) return;
    const el = document.createElement('div');
    el.setAttribute('data-haloplus', 'submitted');
    el.className = 'pt-1 text-xs text-secondary';
    el.innerHTML = `${O.esc(at)} · ${O.esc(files[0])}${files.length > 1 ? ` +${files.length - 1} more` : ''} ${O.mark()}`;
    el.title = `Sent to Halo ${at}. Halo has ${files.length === 1 ? 'this file' : 'these files'} on record: ${files.join(', ')}`;
    cell.appendChild(el);
    O.count('submit-shown');
  }
  function cardsPass() {
    let n = 0;
    for (const c of O.cards()) {
      if (n >= MAX_CARDS) break;
      if (done.has(c.card) || !c.id || !/^(SUBMITTED|LATE)$/.test(c.status)) continue;
      if (!c.card.querySelector('[data-testid="dashboard_calendar_view_submission"]')) continue;
      n += 1;
      void confirm(c);
    }
  }

  // ---- the file type, before submitting ------------------------------------------------------------------------------------
  let asking = null;
  let required = undefined;
  let forId = null;
  async function requiredFor(id) {
    if (forId === id && required !== undefined) return required;
    if (asking && forId === id) return asking;
    forId = id;
    required = undefined;
    asking = (async () => {
      try {
        const d = await O.ask('CourseClassAssessment', Q_ONE, { assessmentId: id }, 10 * 60_000);
        const html = d && d.assessment && d.assessment.description;
        const text = html ? new DOMParser().parseFromString(html, 'text/html').body.textContent || '' : '';
        required = L.requiredType(text);
      } catch {
        required = null;
      }
      asking = null;
      return required;
    })();
    return asking;
  }
  function warnUnder(el, name, req) {
    const next = el.nextElementSibling;
    const has = next && next.getAttribute('data-haloplus') === 'wrongtype';
    const wrong = L.wrongType(name, req);
    if (!wrong) return void (has && next.remove());
    if (has) return;
    const ext = (/\.([a-z0-9]{2,5})$/i.exec(name) || [])[1] || '';
    const w = document.createElement('div');
    w.setAttribute('data-haloplus', 'wrongtype');
    w.className = 'text-xs';
    w.style.cssText = 'color:var(--hp-warning);margin:2px 0 4px';
    w.innerHTML = `${O.mark()} This is a .${O.esc(ext.toLowerCase())} file. The instructions ask for ${KIND[req.key]}.`;
    el.after(w);
    O.count('wrongtype-shown');
  }
  // The file's whole row inside `stop`: a name inside a flex row (a checkbox label) gets its line under the row, never
  // beside the name, however Halo lays the row out.
  function rowOf(el, stop) {
    let r = el;
    while (r.parentElement && r.parentElement !== stop) {
      const cs = getComputedStyle(r.parentElement);
      if (!/flex/.test(cs.display) || /column/.test(cs.flexDirection)) break;
      r = r.parentElement;
    }
    return r;
  }
  async function viewPass() {
    const m = /#assignment-submission\/([^/?#]+)/.exec(location.hash);
    if (!m) return;
    if (/Submitted on /.test(document.body.innerText || '')) return;
    const req = await requiredFor(decodeURIComponent(m[1]));
    if (!req) return;
    // The working files table, and Halo's Review and Submit list.
    for (const a of document.querySelectorAll('a[class*="AssignmentSubmissionTable_filename"]')) warnUnder(a, (a.textContent || '').trim(), req);
    for (const dlg of document.querySelectorAll('[role="dialog"]')) {
      if (!/Review and Submit/i.test(dlg.textContent || '')) continue;
      const walker = document.createTreeWalker(dlg, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        const name = (t.nodeValue || '').trim();
        const el = t.parentElement;
        if (!el || el.closest('[data-haloplus]') || !/^[^/\\]{1,200}\.[a-z0-9]{2,5}$/i.test(name)) continue;
        warnUnder(rowOf(el, dlg), name, req);
      }
    }
  }
  O.feature({
    id: 'submit',
    start() {
      this.update();
    },
    update() {
      cardsPass();
      void viewPass();
    },
    stop() {
      document.querySelectorAll('[data-haloplus="submitted"], [data-haloplus="wrongtype"]').forEach((n) => n.remove());
    },
  });
})();
