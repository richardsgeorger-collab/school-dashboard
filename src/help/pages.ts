import { PRICES, TIER_NAMES, TRIAL } from '../config/tiers';

/**
 * Help pages at real addresses (haloplus.app/help/<slug>/), for GCU students searching for help with Halo and for the
 * AI assistants that answer them (George, 2026-09-30). Each one answers its question honestly first, with what works
 * in Halo itself, and only then mentions Halo+ as one option. Every page says Halo+ is not affiliated with GCU.
 *
 * This file is the one source: the build turns it into the pages, the sitemap and llms.txt (vite.config.ts →
 * helpSite), and the landing page's footer links to the same list. Text here is HTML-escaped by the renderer except
 * `body` fields, which are trusted HTML written in this file.
 */
export interface HelpPage {
  slug: string;
  /** The question as students type it; the page's <h1> and <title>. */
  title: string;
  /** One or two sentences for search results (under 160 characters). */
  description: string;
  /** The answer, up front, in a few sentences. */
  short: string;
  sections: { h: string; body: string }[];
  /** Where Halo+ fits, after the honest answer. */
  haloPlus: string;
  faq: { q: string; a: string }[];
}

const plus = `$${PRICES.plus.month.toFixed(2)}`;
const max = `$${PRICES.max.month.toFixed(2)}`;
const trial = `${TRIAL.days} days`;

export const HELP_PAGES: HelpPage[] = [
  {
    slug: 'gcu-halo-due-dates',
    title: 'How to see all your GCU Halo due dates in one place',
    description: 'Halo lists due dates class by class. Here is how to get every GCU assignment, DQ and quiz on one list, by hand or with a tool.',
    short:
      'Halo keeps due dates inside each class, so there is no single page that is guaranteed to show every deadline from every class. The reliable way is to go through each class once a week and copy every due date onto one list you trust. If that gets old, a planner that reads Halo for you can keep the list for you.',
    sections: [
      {
        h: 'Doing it by hand (free, 15 minutes a week)',
        body: `<ol>
<li>Pick one place for the list: Apple or Google Calendar, Notes, a paper planner, a spreadsheet. One place, not three.</li>
<li>Open <b>halo.gcu.edu</b>, go into your first class and open the current and next topic or week.</li>
<li>Write down every item with a due date: assignments, discussion question (DQ) posts, DQ replies, quizzes, participation. DQs often have one deadline for your first post and a later one for replies, so write both.</li>
<li>Open the class's <b>announcements</b> before you leave. Professors change dates and add requirements there, and the assignment page doesn't always change with them.</li>
<li>Repeat for every class. Sunday night works well, before the new week gets going.</li>
</ol>`,
      },
      {
        h: 'Things that trip people up',
        body: `<ul>
<li><b>Time zones.</b> GCU is in Arizona, which doesn't change clocks for daylight saving. If you're in another state, check what time a deadline actually is where you are.</li>
<li><b>Moved deadlines.</b> A list you made by hand doesn't update itself. If a professor moves something in an announcement, your list is wrong until you notice.</li>
<li><b>Big items hiding in later weeks.</b> Look one week ahead, not just at this week, so a paper or exam doesn't show up with two days' notice.</li>
</ul>`,
      },
    ],
    haloPlus: `Halo+ is a planner that does the copying for you. You click one bookmark while you're logged in to Halo, and your classes, assignments, due dates, grades and announcements come over into one list ranked by what's due first, how long it takes and how many points it's worth. When a date moves in Halo, it moves in Halo+ on the next sync. Halo sync is part of ${TIER_NAMES.plus} (${plus} a month), and every new account gets ${TIER_NAMES.max} free for ${trial} with no card.`,
    faq: [
      {
        q: 'Does Halo have one page with every due date from every class?',
        a: 'Halo organizes work by class. You may see some upcoming items or notifications outside a class, but the dependable list of what is due is inside each class, topic by topic. That is why most students keep their own list.',
      },
      {
        q: 'Do DQ posts and DQ replies have different due dates?',
        a: 'Often, yes. Many GCU classes set one deadline for your first post and a later one for replies. Check each discussion in Halo and write both down.',
      },
      {
        q: 'Will my list update if a professor changes a due date?',
        a: 'A list you made by hand will not. Read announcements in every class at least twice a week. A tool that re-reads Halo, like Halo+, picks up the new date on the next sync.',
      },
    ],
  },
  {
    slug: 'halo-announcements',
    title: 'Halo announcements: how not to miss what your professor asks for',
    description: 'At GCU, professors often put real requirements in Halo announcements. How to find them, what to look for, and how to keep up.',
    short:
      'In a lot of GCU classes, the real instructions are in the announcements: a changed due date, a required format, something to bring to class. Read every announcement in every class at least twice a week, and whenever one asks you to do something, write it onto the assignment it is about so you see it when you start the work.',
    sections: [
      {
        h: 'Where announcements are in Halo',
        body: `<p>Each class in Halo has its own announcements. Open the class and look for the announcements area, and keep an eye on Halo's notifications, which flag new ones. Announcements are per class, so checking one class tells you nothing about the others.</p>`,
      },
      {
        h: 'What to look for in each one',
        body: `<ul>
<li><b>Dates</b>: anything moved earlier or later, extra due dates, in-person days.</li>
<li><b>Requirements</b>: "must", "required", "make sure", "do not". Word counts, file types, APA format, number of sources.</li>
<li><b>Things to bring or buy</b>: lab goggles, a calculator, a printed copy.</li>
<li><b>Changes to grading</b>: a rubric update, extra credit, a dropped assignment.</li>
</ul>
<p>When you find one, put it on the assignment itself, not just in your head: a note in your planner, a comment in your calendar event, a sticky note. The time you need it is when you start the work, which may be a week after you read the announcement.</p>`,
      },
      {
        h: 'A routine that works',
        body: `<p>Twice a week, say Monday and Thursday, open every class's announcements and read anything new. It takes five minutes, and it's the habit that saves the most points.</p>`,
      },
    ],
    haloPlus: `Halo+ reads every announcement in every class for you. When one asks for something (a moved date, a format, a thing to bring), it puts that on the assignment it's about, in your professor's own words, and flags it on your Now screen. Announcements come with Halo sync on ${TIER_NAMES.plus} (${plus} a month), and the ${trial} of free ${TIER_NAMES.max} every new account gets includes it.`,
    faq: [
      {
        q: 'Why do GCU professors put requirements in announcements?',
        a: 'Courses are often built once and taught many times, so instructors use announcements to add their own expectations and changes for your section. The assignment page may not reflect them.',
      },
      {
        q: 'How often should I check Halo announcements?',
        a: 'At least twice a week for every class, and always before you start a big assignment.',
      },
      {
        q: 'Do I get notified about new announcements?',
        a: "Halo shows notifications for new activity, but it is easy to miss them across several classes. Reading each class's announcements on a schedule is the safe habit.",
      },
    ],
  },
  {
    slug: 'halo-calendar-export',
    title: 'GCU Halo calendar: getting your assignments into Google or Apple Calendar',
    description: 'How to get GCU Halo due dates into Google Calendar, Apple Calendar or Outlook: by hand, with an .ics export, and what each way misses.',
    short:
      "As far as we can tell, Halo doesn't have a built-in link to subscribe to your due dates in another calendar. You can add them by hand, or export them as an .ics calendar file with a free browser extension and import that file. Either way, the copy in your calendar doesn't change when a date changes in Halo, so you still need to watch announcements.",
    sections: [
      {
        h: 'Option 1: by hand',
        body: `<p>Make an all-day event or a timed event for each due date, with the class code in the title ("ENG-105: Rhetorical analysis draft"). Add a reminder a day or two before. It's tedious, but it's reliable and you'll actually read every assignment along the way.</p>`,
      },
      {
        h: 'Option 2: export an .ics file',
        body: `<p>Better Halo, a free independent Chrome extension, adds an <b>Export Assignments</b> button to Halo that downloads your assignments as an .ics file. Then import it:</p>
<ul>
<li><b>Google Calendar</b> (on a computer): Settings → Import &amp; export → Import, pick the file and the calendar to put it in.</li>
<li><b>Apple Calendar</b> (Mac): File → Import, pick the file.</li>
<li><b>Outlook</b>: Add calendar → Upload from file.</li>
</ul>
<p>Make a separate calendar called something like "School" first, so you can delete and re-import it cleanly when dates change.</p>`,
      },
      {
        h: 'What a calendar copy misses',
        body: `<p>An imported file is a snapshot. It won't know when a professor moves a date, it has no grades or points, and it doesn't include what announcements ask for. Re-import every week or two, and keep reading announcements.</p>`,
      },
    ],
    haloPlus: `Halo+ has its own calendar of your Halo work (month and day-by-day views), and it stays current: each sync re-reads Halo, so a moved date moves. It can also import that same .ics file if you'd rather start that way. The calendar views are free; Halo sync is part of ${TIER_NAMES.plus} (${plus} a month), with ${TIER_NAMES.max} free for ${trial} when you sign up.`,
    faq: [
      {
        q: 'Can I subscribe to my GCU Halo due dates in Google Calendar?',
        a: 'We have not found a subscribe link in Halo. The usual ways are adding dates by hand or importing an .ics file exported with a browser extension, which is a one-time copy.',
      },
      {
        q: 'Will imported events update when a due date changes?',
        a: 'No. An imported .ics file is a snapshot. Delete and re-import it after dates change, or use a tool that re-reads Halo.',
      },
      {
        q: 'What time zone are Halo due dates in?',
        a: 'GCU is in Arizona, which does not observe daylight saving time. Check the time of each deadline against where you are.',
      },
    ],
  },
  {
    slug: 'halo-app-iphone-ipad',
    title: 'Halo GCU app for iPhone and iPad: what works',
    description: 'Using GCU Halo on an iPhone or iPad: the browser, adding Halo to your Home Screen, uploading files, and which apps to be careful with.',
    short:
      'Halo is a website, halo.gcu.edu, and it works in Safari or Chrome on an iPhone or iPad. For an app-like icon, open it in Safari and use Share → Add to Home Screen. If GCU publishes an official app in the App Store, that one is safe to use; be careful with any other app that asks for your GCU password.',
    sections: [
      {
        h: 'Put Halo on your Home Screen',
        body: `<ol>
<li>Open Safari and go to <b>halo.gcu.edu</b>, then log in.</li>
<li>Tap the Share button (the square with the arrow).</li>
<li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
</ol>
<p>Now Halo opens with one tap, like an app.</p>`,
      },
      {
        h: 'Tips for phones and iPads',
        body: `<ul>
<li><b>Uploading work</b>: save your file to the Files app (or iCloud Drive) first, then pick it from there in Halo's upload.</li>
<li><b>A page looks broken on iPad</b>: try Safari's "Request Desktop Website" from the page menu (aA), or rotate to landscape.</li>
<li><b>Quizzes and timed work</b>: use a computer if you can. A phone call, a notification or a lost connection mid-quiz is a bad time to find out.</li>
<li><b>Your password</b>: only type your GCU password on GCU's own login page. No planner or study app needs it.</li>
</ul>`,
      },
    ],
    haloPlus: `Halo+ works on iPhone and iPad as a Home Screen app, with notifications for what's due (on iPhone, notifications need it added to the Home Screen, which the app walks you through). The sync bookmark works on a phone too: you add it once and tap it while you're logged in to Halo in Safari. Halo sync is part of ${TIER_NAMES.plus} (${plus} a month); every new account gets ${TIER_NAMES.max} free for ${trial}.`,
    faq: [
      {
        q: 'Is there an official Halo app for iPhone?',
        a: 'Halo runs in the browser at halo.gcu.edu and works on iPhone and iPad. Check the App Store for apps published by Grand Canyon University itself; anything else is not from GCU.',
      },
      {
        q: 'How do I get Halo on my iPhone Home Screen?',
        a: 'Open halo.gcu.edu in Safari, tap Share, then Add to Home Screen.',
      },
      {
        q: 'Can I take Halo quizzes on my phone?',
        a: 'You may be able to, but a computer is safer for timed quizzes: a call, a notification or a dropped connection can interrupt you.',
      },
    ],
  },
  {
    slug: 'halo-vs-halo-plus',
    title: "Halo vs Halo+: what's the difference?",
    description: "Halo is GCU's learning platform. Halo+ is an independent planner that reads from it. What each one does, and when you don't need Halo+.",
    short:
      "Halo is GCU's learning platform: it's where your classes live, where you submit work, take quizzes, post DQs and see your official grades. Halo+ is an independent planner made by a GCU student that reads your Halo data and turns it into one list of what to do next. You still do all your actual work in Halo. Halo+ is not made by, affiliated with or endorsed by GCU.",
    sections: [
      {
        h: 'Side by side',
        body: `<table>
<thead><tr><th></th><th>Halo</th><th>Halo+</th></tr></thead>
<tbody>
<tr><th scope="row">Made by</th><td>Grand Canyon University</td><td>An independent student developer</td></tr>
<tr><th scope="row">Submit work, quizzes, DQs</th><td>Yes, this is where you do it</td><td>No, it links you to Halo</td></tr>
<tr><th scope="row">Official grades</th><td>Yes</td><td>Shows Halo's grades and what you need on the rest</td></tr>
<tr><th scope="row">Every class's work in one list</th><td>Organized class by class</td><td>Yes, ranked by due date, time and points</td></tr>
<tr><th scope="row">Announcements</th><td>Per class</td><td>Read for you, requirements put on the assignment</td></tr>
<tr><th scope="row">Cost</th><td>Part of being a GCU student</td><td>Free plan; ${TIER_NAMES.plus} ${plus}/mo; ${TIER_NAMES.max} ${max}/mo</td></tr>
</tbody>
</table>`,
      },
      {
        h: "When you don't need Halo+",
        body: `<p>If you have a couple of classes, check Halo every day and keep a list you trust, Halo on its own is fine. Halo+ is for when you have five or six classes, deadlines keep sneaking up, or announcements keep changing what an assignment needs.</p>`,
      },
    ],
    haloPlus: `How Halo+ gets your data: you click a bookmark while you're logged in to Halo, and it reads your classes, assignments, grades and announcements from that page. It never sees your password, and its code is public on GitHub. The Free plan works from a syllabus and things you add; Halo sync is ${TIER_NAMES.plus} (${plus} a month); the AI study tools are ${TIER_NAMES.max} (${max} a month). Every new account gets ${TIER_NAMES.max} free for ${trial}, no card.`,
    faq: [
      {
        q: 'Is Halo+ made by GCU?',
        a: 'No. Halo+ is an independent planner made by a student. It is not affiliated with, endorsed by, or connected to Grand Canyon University.',
      },
      {
        q: 'Can I submit assignments through Halo+?',
        a: 'No. You submit, post and take quizzes in Halo. Halo+ only plans: it tells you what is due and links you to it in Halo.',
      },
      {
        q: 'Does Halo+ need my GCU password?',
        a: 'No, and it never asks. The sync bookmark works because you are already logged in to Halo in that browser.',
      },
    ],
  },
  {
    slug: 'halo-grades',
    title: 'How to check your grades in GCU Halo, and what you need on the rest',
    description: 'Where your grades are in GCU Halo, how points-based grades work, and a simple formula for what you need on the rest of the class.',
    short:
      "Your grades are in each class's gradebook in Halo. Most GCU classes grade by points: your grade so far is the points you've earned divided by the points that have been graded. To find what you need on the rest, take the points you need for your target grade, subtract what you've earned, and divide by the points still left.",
    sections: [
      {
        h: 'Finding your grades in Halo',
        body: `<p>Open the class in Halo and go to its grades or gradebook. You'll see each graded item with your points, and often instructor feedback. Feedback and rubric scores are worth opening: they tell you what to fix on the next one.</p>
<p>Check your syllabus for the grading scale (what percent is an A, B, and so on) and whether any categories are weighted. If they are, the simple formula below is only a rough guide.</p>`,
      },
      {
        h: 'What do I need on the rest?',
        body: `<p><b>Needed average on what's left = (target % × total points in the class − points earned so far) ÷ points still left</b></p>
<p>Example: a class worth 1,000 points. You've earned 520 of the 600 graded so far (86.7%). You want 90% overall, which is 900 points. You need 900 − 520 = 380 of the remaining 400, or 95% on everything left. If that's not realistic, an 80% (B) needs 280 of 400, or 70%.</p>`,
      },
    ],
    haloPlus: `Halo+ shows Halo's real grades for every class on one screen and works out what you need on the rest of the term for the grade you want. Grades come with Halo sync on ${TIER_NAMES.plus} (${plus} a month), and ${TIER_NAMES.max} is free for ${trial} when you sign up.`,
    faq: [
      {
        q: 'Why does my Halo grade change so much early in the class?',
        a: 'Early on, only a few points have been graded, so each item moves the percentage a lot. It steadies as more of the class is graded.',
      },
      {
        q: 'Is my grade in Halo my final grade?',
        a: 'Your final grade is what GCU posts at the end of the class. The Halo gradebook is your running grade; ask your instructor if something looks wrong.',
      },
      {
        q: 'How do I work out what I need on my final?',
        a: 'Points needed for your target grade, minus points earned so far, divided by the points left. If the class uses weighted categories, use the weights from the syllabus instead.',
      },
    ],
  },
  {
    slug: 'is-halo-plus-safe',
    title: 'Is it safe to connect a planner to GCU Halo? Passwords and privacy',
    description: 'What to check before you connect any app to your GCU Halo account, and exactly how Halo+ handles your password and data.',
    short:
      "The one rule: never type your GCU password into anything except GCU's own login page. A trustworthy tool either reads Halo while you're already logged in, or works from files you give it. It should also let you see your data, export it and delete it, and say plainly that it isn't from GCU if it isn't.",
    sections: [
      {
        h: 'Questions to ask of any Halo tool',
        body: `<ul>
<li><b>Does it ask for my GCU password?</b> If yes, don't use it.</li>
<li><b>Who made it, and is it from GCU?</b> An independent tool should say so clearly.</li>
<li><b>What does it take, and where does it go?</b> Look for a privacy page in plain words.</li>
<li><b>Can I delete everything?</b> You should be able to, in one step.</li>
<li><b>Can anyone check the code?</b> Open-source code is a good sign, not a guarantee.</li>
</ul>`,
      },
      {
        h: 'How Halo+ handles it',
        body: `<ul>
<li><b>No password.</b> The sync bookmark runs on Halo's own page while you're logged in there. It never sees your GCU password and never asks for it.</li>
<li><b>What it reads</b>: your classes, assignments, due dates, grades, feedback and announcements, and you approve the changes before they're applied.</li>
<li><b>Your account</b>: each account can read only its own data, enforced by the database.</li>
<li><b>AI features</b> send only the text they need, and the AI provider does not train on it.</li>
<li><b>Export or delete</b> everything from the You page at any time.</li>
<li><b>Public code</b> at github.com/richardsgeorger-collab/school-dashboard.</li>
</ul>
<p>The full details are on the <a href="../../privacy.html">privacy page</a>.</p>`,
      },
    ],
    haloPlus: `Halo+ is an independent planner made by a GCU student, not by GCU. It's free to start, with ${TIER_NAMES.max} free for ${trial} and no card.`,
    faq: [
      {
        q: 'Does Halo+ need my GCU password?',
        a: 'No, and it never asks. The bookmark works because you are already logged in to Halo in that browser. The code is public on GitHub, so anyone can check.',
      },
      {
        q: 'Is Halo+ from GCU?',
        a: 'No. Halo+ is independent. It is not affiliated with, endorsed by, or connected to Grand Canyon University. Halo is GCU\'s learning platform.',
      },
      {
        q: 'Can I delete my Halo+ data?',
        a: 'Yes. You → Advanced → Delete my account removes every row and the account itself, immediately. You can export everything as one file first.',
      },
    ],
  },
];

export const SITE = 'https://haloplus.app/';
export const helpUrl = (slug: string) => `${SITE}help/${slug}/`;
export const NOT_AFFILIATED = 'Halo+ is an independent planner made by a student. It is not affiliated with, endorsed by, or connected to Grand Canyon University. Halo is GCU\u2019s learning platform.';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The product, as every help page describes it to search engines. */
export const SOFTWARE_APP = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Halo+',
  alternateName: 'Halo Plus',
  url: SITE,
  applicationCategory: 'EducationalApplication',
  operatingSystem: 'Web, iOS, Android',
  description: 'A planner for GCU students that reads Halo: classes, assignments, grades and announcements on one screen that says what to do next. Independent, not affiliated with Grand Canyon University.',
  image: `${SITE}og.png`,
  offers: [
    { '@type': 'Offer', name: TIER_NAMES.free, price: '0', priceCurrency: 'USD' },
    { '@type': 'Offer', name: TIER_NAMES.plus, price: PRICES.plus.month.toFixed(2), priceCurrency: 'USD' },
    { '@type': 'Offer', name: TIER_NAMES.max, price: PRICES.max.month.toFixed(2), priceCurrency: 'USD' },
  ],
};

const STYLE = `:root{--bg:#f6f7f9;--card:#fff;--ink:#14171c;--ink-2:#4b5261;--line:#e3e6eb;--accent:#b8860b;--accent-soft:#fbf3dd}
@media(prefers-color-scheme:dark){:root{--bg:#0b0d10;--card:#14171c;--ink:#f2f4f7;--ink-2:#a9b0bc;--line:#262a31;--accent:#f0b941;--accent-soft:#2a2414}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 Inter,-apple-system,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:720px;margin:0 auto;padding:20px 16px 64px}
header.top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:28px}
.brand{font:800 18px/1 "Plus Jakarta Sans",Inter,sans-serif;color:var(--ink);text-decoration:none}.brand span{color:var(--accent)}
.cta{display:inline-block;padding:8px 14px;border-radius:999px;background:var(--accent);color:#14171c;font-weight:600;text-decoration:none;font-size:14px}
.crumb{font-size:14px;color:var(--ink-2);margin:0 0 6px}.crumb a{color:inherit}
h1{font:800 clamp(28px,6vw,38px)/1.15 "Plus Jakarta Sans",Inter,sans-serif;letter-spacing:-.02em;margin:0 0 16px}
h2{font:700 20px/1.3 "Plus Jakarta Sans",Inter,sans-serif;margin:36px 0 10px}
p,li,td,th{color:var(--ink-2)}b,strong,th[scope=row]{color:var(--ink)}a{color:var(--ink)}
.short{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:12px;padding:16px 18px;color:var(--ink);font-size:17px}
.fits{background:var(--accent-soft);border-radius:12px;padding:16px 18px}.fits p{color:var(--ink);margin:0}
ol,ul{padding-left:22px}li{margin:6px 0}
table{width:100%;border-collapse:collapse;font-size:15px;display:block;overflow-x:auto}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}thead th{color:var(--ink)}
dl dt{font-weight:600;color:var(--ink);margin-top:18px}dl dd{margin:4px 0 0;color:var(--ink-2)}
.more{list-style:none;padding:0}.more li{margin:8px 0}
footer{margin-top:48px;padding-top:16px;border-top:1px solid var(--line);font-size:14px}footer p{margin:6px 0}`;

function shell(o: { title: string; description: string; canonical: string; base: string; jsonLd: object[]; body: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(o.title)} · Halo+</title>
<meta name="description" content="${esc(o.description)}" />
<link rel="canonical" href="${o.canonical}" />
<link rel="icon" href="${o.base}icon.svg" type="image/svg+xml" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="Halo+" />
<meta property="og:title" content="${esc(o.title)}" />
<meta property="og:description" content="${esc(o.description)}" />
<meta property="og:url" content="${o.canonical}" />
<meta property="og:image" content="${SITE}og.png" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Plus+Jakarta+Sans:wght@700;800&display=swap" rel="stylesheet" />
<style>${STYLE}</style>
${o.jsonLd.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head>
<body>
<div class="wrap">
<header class="top"><a class="brand" href="${o.base}">Halo<span>+</span></a><a class="cta" href="${o.base}#/start">Try Halo+ free</a></header>
${o.body}
<footer>
<p>${esc(NOT_AFFILIATED)}</p>
<p><a href="${o.base}help/">Help</a> · <a href="${o.base}">Halo+</a> · <a href="${o.base}privacy.html">Privacy</a> · <a href="${o.base}terms.html">Terms</a></p>
</footer>
</div>
</body>
</html>
`;
}

/** One help page, as served at /help/<slug>/. `base` is the site's base path ("/" on haloplus.app). */
export function renderHelpPage(p: HelpPage, base = '/'): string {
  const others = HELP_PAGES.filter((o) => o.slug !== p.slug);
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: p.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
  const crumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Halo+', item: SITE },
      { '@type': 'ListItem', position: 2, name: 'Help', item: `${SITE}help/` },
      { '@type': 'ListItem', position: 3, name: p.title, item: helpUrl(p.slug) },
    ],
  };
  const body = `<main>
<p class="crumb"><a href="${base}help/">Help for GCU Halo</a></p>
<h1>${esc(p.title)}</h1>
<p class="short">${esc(p.short)}</p>
${p.sections.map((s) => `<h2>${esc(s.h)}</h2>\n${s.body}`).join('\n')}
<h2>Where Halo+ fits</h2>
<div class="fits"><p>${esc(p.haloPlus)}</p></div>
<h2>Questions</h2>
<dl>
${p.faq.map((f) => `<dt>${esc(f.q)}</dt><dd>${esc(f.a)}</dd>`).join('\n')}
</dl>
<h2>More help</h2>
<ul class="more">
${others.map((o) => `<li><a href="${base}help/${o.slug}/">${esc(o.title)}</a></li>`).join('\n')}
</ul>
</main>`;
  return shell({ title: p.title, description: p.description, canonical: helpUrl(p.slug), base, jsonLd: [SOFTWARE_APP, faqLd, crumbs], body });
}

/** The list of help pages, at /help/. */
export function renderHelpIndex(base = '/'): string {
  const body = `<main>
<h1>Help for GCU Halo</h1>
<p class="short">Straight answers to the things GCU students search about Halo: due dates, announcements, calendars, grades, using it on a phone. Each page answers the question first; Halo+ comes up only where it fits.</p>
<ul class="more">
${HELP_PAGES.map((p) => `<li><a href="${base}help/${p.slug}/"><b>${esc(p.title)}</b></a><br />${esc(p.description)}</li>`).join('\n')}
</ul>
</main>`;
  return shell({ title: 'Help for GCU Halo', description: 'Straight answers for GCU students about Halo: due dates, announcements, calendar export, grades, and using Halo on iPhone and iPad.', canonical: `${SITE}help/`, base, jsonLd: [SOFTWARE_APP], body });
}

/** Every address the site wants found, for sitemap.xml and IndexNow. */
export function siteUrls(): string[] {
  return [SITE, `${SITE}help/`, ...HELP_PAGES.map((p) => helpUrl(p.slug)), `${SITE}privacy.html`, `${SITE}terms.html`];
}

export function renderSitemap(lastmod: string): string {
  const pri = (u: string) => (u === SITE ? '1.0' : u.includes('/help/') ? '0.8' : '0.3');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${siteUrls()
  .map((u) => `  <url><loc>${u}</loc><lastmod>${lastmod}</lastmod><priority>${pri(u)}</priority></url>`)
  .join('\n')}
</urlset>
`;
}

/** llms.txt (llmstxt.org): Halo+ in plain words for AI assistants, with links to the pages that answer questions. */
export function renderLlmsTxt(): string {
  return `# Halo+

> Halo+ is an independent planner for Grand Canyon University (GCU) students who use Halo, GCU's learning platform. It reads a student's Halo classes, assignments, due dates, grades and announcements and shows them on one screen that says what to do next. ${NOT_AFFILIATED}

Website: ${SITE}

## What it does

- Pulls every class's assignments, discussion questions (DQs), quizzes and due dates from Halo into one list, ranked by due date, time it takes and points.
- Reads every class announcement and puts what it asks for (a moved date, a required format, something to bring) on the assignment it is about, in the professor's words.
- Shows Halo's real grades for every class and what the student needs on the rest of the term.
- Reminders and notifications for what is due; works on iPhone, iPad, Android and computers as a Home Screen web app.
- Study tools (on the Max plan): Ask questions about your own classes, Practice (study plans, worksheets with answers, quiz me, flashcards from your class material), and Check your work against the rubric.

## How it connects to Halo

- A bookmark ("Sync Halo") the student clicks while logged in to halo.gcu.edu. It runs on Halo's page and never sees or asks for the student's GCU password. On ${TIER_NAMES.plus}, an optional Chrome extension also syncs on its own.
- The student reviews changes before they are applied. Assignments are still submitted in Halo; Halo+ only plans.
- Source code is public: https://github.com/richardsgeorger-collab/school-dashboard

## Plans (US dollars)

- ${TIER_NAMES.free}: $0. Works from a syllabus PDF and items you add. No Halo sync, no AI.
- ${TIER_NAMES.plus}: ${plus} a month. Halo sync, Halo grades, announcements read for you, notifications.
- ${TIER_NAMES.max}: ${max} a month. Everything in ${TIER_NAMES.plus} plus the AI study tools.
- Every new account gets ${TIER_NAMES.max} free for ${trial}, no card. A friend link gives both people extra free time.

## Help pages

${HELP_PAGES.map((p) => `- [${p.title}](${helpUrl(p.slug)}): ${p.description}`).join('\n')}

## Other

- [Privacy](${SITE}privacy.html)
- [Terms](${SITE}terms.html)
- Contact: the developer, through the email on the privacy page.
`;
}
