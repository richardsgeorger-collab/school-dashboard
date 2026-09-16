# The AI layer

How assignments become items with real reasoning behind them, and what is built on top. Everything runs in the
browser against the key stored on this device; nothing goes through a server of ours. The parser stays as the fallback
and as the default for any class not switched over.

## Ingestion (src/ingest)

| Step | Module | What it does |
| --- | --- | --- |
| Gather | `context.ts` | Everything on file for one class: Halo items with their descriptions, the syllabus, rubric files (whole), slide decks (first line per slide), lecture knowledge (summaries, what was stressed, exam flags). Hashed on the parts the model reasons from, so an unchanged class is never re-reasoned. |
| Class pass | `plan.ts` | Three small calls over one cached copy of that context. **A** (`class_core`): every item's asks, start-by, effort, flags, topics. **B** (`class_detail`): milestones and prerequisites for the work with parts, work found outside Halo (needs a quote; no written date means no due date), the class's topic map. **C** (`class_material`): which slides, rubrics, and lectures cover which item; skipped when the class library is empty. A must land; B and C degrade and say so in `plan.incomplete`. |
| Term pass | `term.ts` | One cheap call (`term_plan`) over every open item in every class, with the effort each takes: start-by dates against everything else due, brutal/heavy weeks with a reason, draft→final chains. Skips items the student fixed. |
| Diff | `diff.ts` | The plan held against the planner. Skips user overrides, declined fields, done items, steps in progress. Gates never move the item they gate. |
| Apply | `apply.ts` | Writes what was checked: `plan` (provenance), `startByPlan`, `estimatedMinutes`, steps, flags, `blocks` for prerequisites, found items (stable ids). Unchecked suggestions land in `planDeclined` and are never suggested again. Notes, status, logged time, and overrides are never touched. |
| Run | `run.ts`, `auto.ts` | Cache-first orchestration; background re-run after a sync or a new file for classes on the AI version; changes wait as a line on the class page. |

The compare screen is `#/ingest?c=<courseId>` (class page → "AI plan (compare)"). It shows the cost line, runs the
passes, lists parser vs AI per item, and opens the review. Applying switches the class to the AI version (`course.ingest
= 'ai'`); "Back to the parser" switches back. The scheduler honors an accepted `startByPlan` between the computed
start-by and the student's own override; a Halo sync keeps an AI estimate for a class on the AI version.

Due dates are never asked of the model. Halo's dates stay Halo's.

### Why the schemas look the way they do

The first version asked for all of that in one `strict` tool. Strict mode compiles the schema into a decoding grammar,
and that one came back `400 invalid_request_error: the compiled grammar is too large`. What made it large was nesting:
a `{value, why, confidence}` object per field, enums inside array items, objects inside objects.

So the rules now are:

- **No `strict` in the AI layer.** Every reader already drops fields that are wrong, which is the real guarantee; the
  grammar bought nothing and could only fail. Forced `tool_choice` still gets structured output, and `callTool` falls
  back to parsing JSON out of a text answer if a tool block ever fails to appear.
- **Flat shapes.** Scalars and string arrays, one level of nesting at most. Confidence is one value per item plus an
  `unsure` list of field names, not a block per field. Flags are a string array, not four booleans in an object.
- **Plain strings where an enum is not load-bearing**, validated in code against the same list.
- **Split when a schema wants to grow.** Three bounded calls fail one at a time; one big call fails completely.

The three passes share one prompt prefix — what is on file, then the class as it stands — so it is written to the cache
once and read back at a tenth of the price. The per-pass rules go last, because the cache matches on a prefix.

## Built on top (src/tutor, src/study, src/domain/concepts.ts, src/ingest/links.ts, src/work/brief.ts)

- **Tutor** `#/tutor?c=&t=&i=`: sources gathered from the class library (`quiz/sources.ts`) with `[S#]` ids; the rules
  and the sources are cached across turns; the situation block carries what is coming, what the professor flagged, weak
  topics, and cross-class links. Next step, not the answer. Nothing submittable.
- **Lecture knowledge**: the after-lecture pass (`record/summarize.ts`) also returns what was stressed, exam flags,
  slides dwelt on or skipped (against the day's deck outline), and terms, with `[mm:ss]` moments.
- **Concept warnings**: `topicScores` by topic (Halo unit + AI topics), `conceptWarnings` through the class topic map
  and cross-class links to the first open item that assumes a weak topic. One line on Now (≤ 3 weeks), Grades, class page.
- **Method check**: `checkMethod` on problem sets — setup right or off, the step to look at again, never the number.
- **Cross-class links**: `findLinks` once two classes carry topic maps; said once on the item.
- **Study kits** `#/study?c=&k=&t=`: formula sheet, flashcards, one-pager from the material on file, weak topics first,
  cached by their sources.

## Cost (measured in Settings → AI)

Every call records the tokens the API reported (`src/ai/usage.ts`), by month and kind, priced at editable per-million
rates (defaults: $3 in, $15 out, $0.30 cache read, $3.75 cache write).

Estimates at those prices:

| Pass | Input | Output | Cost | Notes |
| --- | --- | --- | --- | --- |
| Class pass, one class (3 calls) | 25–50k, cached after the first | 6–10k | $0.15–0.30 | Syllabus + 30 descriptions + rubrics + deck outlines. ~1 min. Splitting costs about a third more in input than one call would, and about two cents; it buys bounded failures. |
| Term pass | 8–12k | 4–8k | $0.10–0.15 | Titles, dates, minutes only. |
| Full six-class run | ~200k | ~60k | ~$2 | Only on first run or when everything changed. |
| Re-run after a sync | per changed class | | ~$0.45 | Classes whose inputs did not change are skipped. |
| Lecture read | ~15k | ~2k | ~$0.08 | Per recording. |
| Tutor turn | 5–10k (cached after the first) | ~300 | $0.03 first, ~$0.01 after | |
| Study kit | ~25k | ~3k | ~$0.12 | Cached until the material changes. |
| Brief, draft or method check | 5–20k | ~1k | $0.03–0.08 | |

A normal month (weekly syncs touching three classes, twenty lectures, a hundred tutor turns, a dozen kits, forty
checks) lands around $12–15; a heavy month around $30. Ways to cut it further, not built because none changes what the
student sees: a delta pass that re-reasons only changed items against the cached stable block; Haiku for the term and
links passes; skipping deck outlines for decks already covered by a lecture read.
