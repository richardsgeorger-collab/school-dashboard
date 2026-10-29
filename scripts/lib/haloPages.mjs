// Stand-ins for Halo's pages, for the Halo+-on-Halo tests (extension 0.12.0). The structure, class names, ids, test ids
// and texts are Halo's own, read from Halo's public code (build 2026-10-27; research notes in LOOP_LOG Loop 271); the
// look is Halo's real stylesheets and fonts, taken from Halo's public CDN at test time (lib/haloReal.mjs), with the
// base MUI rules Halo's components would add. The data is the demo student's (scripts/onhalo-fixture.ts): made up.
// A fake Halo answers the session, the gateway (GraphQL) and the orchestration REST calls the pages and Halo+ make,
// and records every call, so tests can count what Halo+ asks Halo.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { haloBuild } from './haloReal.mjs';

export const PHX = 'America/Phoenix';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const snake = (s) => String(s).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase();

/** The demo student, as Halo would report her, and the index Halo+ builds from that. */
export function onHaloFixture() {
  const r = spawnSync('npx', ['tsx', 'scripts/onhalo-fixture.ts'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout);
}

// Halo's date formats, in Halo's zone.
const fmt = (iso, opts) => new Intl.DateTimeFormat('en-US', { timeZone: PHX, ...opts }).formatToParts(new Date(iso));
export function haloFull(iso) {
  const p = fmt(iso, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  const g = (t) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('month')} ${g('day')}, ${g('year')}, ${g('hour')}:${g('minute')} ${g('dayPeriod').toUpperCase()}`;
}

// The MUI v4 rules Halo's mounted components inject (JSS), for the classes the stand-ins use.
const MUI = `
*,*::before,*::after{box-sizing:inherit}html{box-sizing:border-box}
.MuiPaper-root{color:rgba(0,0,0,.87);background-color:#fff;transition:box-shadow .3s cubic-bezier(.4,0,.2,1)}
.MuiPaper-rounded{border-radius:4px}.MuiPaper-elevation0{box-shadow:none}
.MuiPaper-elevation1{box-shadow:0 2px 1px -1px rgba(0,0,0,.2),0 1px 1px 0 rgba(0,0,0,.14),0 1px 3px 0 rgba(0,0,0,.12)}
.MuiPaper-elevation3{box-shadow:0 3px 3px -2px rgba(0,0,0,.2),0 3px 4px 0 rgba(0,0,0,.14),0 1px 8px 0 rgba(0,0,0,.12)}
.MuiContainer-root{width:100%;display:block;margin-left:auto;margin-right:auto;padding-left:16px;padding-right:16px}
@media (min-width:600px){.MuiContainer-root{padding-left:24px;padding-right:24px}}
@media (min-width:1280px){.MuiContainer-maxWidthLg{max-width:1280px}}
.MuiGrid-container{width:100%;display:flex;flex-wrap:wrap}.MuiGrid-item{margin:0}
.MuiGrid-spacing-xs-4{width:calc(100% + 32px);margin:-16px}.MuiGrid-spacing-xs-4>.MuiGrid-item{padding:16px}
.MuiGrid-grid-xs-12{flex-grow:0;max-width:100%;flex-basis:100%}
@media (min-width:960px){.MuiGrid-grid-md-6{flex-grow:0;max-width:50%;flex-basis:50%}}
@media (min-width:1280px){.MuiGrid-grid-lg-4{flex-grow:0;max-width:33.333333%;flex-basis:33.333333%}}
.MuiButtonBase-root{color:inherit;border:0;cursor:pointer;margin:0;display:inline-flex;outline:0;padding:0;position:relative;align-items:center;user-select:none;border-radius:0;vertical-align:middle;justify-content:center;text-decoration:none;background-color:transparent;-webkit-appearance:none}
.MuiButton-root{color:rgba(0,0,0,.87);padding:6px 16px;font-size:.875rem;min-width:64px;font-weight:500;line-height:1.75;border-radius:4px;letter-spacing:.02857em;text-transform:uppercase}
.MuiButton-label{width:100%;display:inherit;align-items:inherit;justify-content:inherit}
.MuiButton-text{padding:6px 8px}
.MuiButton-contained{box-shadow:0 3px 1px -2px rgba(0,0,0,.2),0 2px 2px 0 rgba(0,0,0,.14),0 1px 5px 0 rgba(0,0,0,.12);background-color:#e0e0e0}
.MuiButton-outlined{border:1px solid rgba(0,0,0,.23);padding:5px 15px}
.MuiButton-sizeSmall{padding:4px 10px;font-size:.8125rem}
.MuiButton-outlinedSizeSmall{padding:3px 9px}
.MuiButtonGroup-root{display:inline-flex;border-radius:4px}
.MuiButtonGroup-grouped{min-width:40px}
.MuiButtonGroup-groupedHorizontal:not(:first-child){border-top-left-radius:0;border-bottom-left-radius:0}
.MuiButtonGroup-groupedHorizontal:not(:last-child){border-top-right-radius:0;border-bottom-right-radius:0}
.MuiButtonGroup-groupedOutlinedHorizontal:not(:first-child){margin-left:-1px}
.MuiIconButton-root{flex:0 0 auto;color:rgba(0,0,0,.54);padding:12px;overflow:visible;font-size:1.5rem;text-align:center;border-radius:50%}
.MuiIconButton-sizeSmall{padding:3px;font-size:1.125rem}.MuiIconButton-colorInherit{color:inherit}
.MuiIconButton-label{width:100%;display:flex;align-items:inherit;justify-content:inherit}
.MuiSvgIcon-root{fill:currentColor;width:1em;height:1em;display:inline-block;font-size:1.5rem;flex-shrink:0;user-select:none}
.MuiSvgIcon-fontSizeSmall{font-size:1.25rem}
.MuiAppBar-root{width:100%;display:flex;z-index:1100;box-sizing:border-box;flex-shrink:0;flex-direction:column}
.MuiAppBar-positionStatic{position:static}.MuiAppBar-colorPrimary{color:#fff;background-color:var(--lms-primaryColor,#522398)}
.MuiToolbar-root{display:flex;position:relative;align-items:center}.MuiToolbar-gutters{padding-left:16px;padding-right:16px}
.MuiToolbar-regular{min-height:56px}
.MuiCollapse-container,.MuiCollapse-root{height:0;overflow:hidden}.MuiCollapse-entered{height:auto;overflow:visible}.MuiCollapse-hidden{visibility:hidden}
.MuiBadge-root{display:inline-flex;position:relative;flex-shrink:0;vertical-align:middle}
.MuiTypography-root{margin:0}.MuiDivider-root{border:none;height:1px;margin:0;flex-shrink:0;background-color:rgba(0,0,0,.12)}
.MuiAlert-root{display:flex;padding:6px 16px;font-size:.875rem;border-radius:4px;line-height:1.43}
.MuiAlert-standardInfo{color:#0d3c61;background-color:#e8f4fd}
.MuiPagination-ul{display:flex;flex-wrap:wrap;list-style:none;padding:0;margin:0 0 0 8px;align-items:center}
.MuiPagination-ul button{all:unset;cursor:pointer;min-width:28px;height:28px;text-align:center;border-radius:14px;font:600 12px/28px 'Open Sans';color:#1a65b0}
.MuiPagination-ul button[aria-current]{background:#1a65b0;color:#fff}
.MuiButton-containedSecondary{color:#fff;background-color:#1a65b0}
.MuiButton-outlinedSecondary{color:#1a65b0;border:1px solid #1a65b0}
`;

/** A page in Halo's frame: Halo's stylesheets for `route`, its fonts, its own data (school time zone), the header bar. */
// MUI's styles come first, as on Halo (its StylesProvider injectFirst), so Halo's own CSS wins at equal specificity.
function shell(build, route, title, body, { sidebar = null } = {}) {
  const next = { props: { pageProps: {}, tenantConfig: { timezone: { id: PHX, utcOffset: -7 } } }, page: route, query: {}, buildId: build.buildId, runtimeConfig: { orchestrationApiEndpoint: 'https://orchestration.halo.gcu.edu/api/v1/orchestrate/', gatewayEndpoint: 'https://gateway.halo.gcu.edu/' } };
  const header = `<div class="${build.cls('Header_headerContainer')} hideFromMobile" id="header_main_container"><header class="MuiPaper-root MuiAppBar-root MuiAppBar-positionStatic MuiAppBar-colorPrimary h-20 MuiPaper-elevation0"><div class="MuiToolbar-root MuiToolbar-regular ${build.cls('Header_toolbar')} MuiToolbar-gutters">
<a id="guide_anchor_header_logo" href="/"><span class="w-48 h-12 md:ml-4 md:mr-8" style="display:inline-block;color:#fff;font:700 22px/48px 'Open Sans';letter-spacing:.08em">HALO</span></a>
<div class="${build.cls('ClassSelector_headerIconContainer')}"><button id="guide_anchor_header_myClasses" class="MuiButtonBase-root MuiIconButton-root ${build.cls('ClassSelector_button')} MuiIconButton-colorInherit" data-testid="class_selector_button" type="button"><span class="MuiIconButton-label"><p class="font-display-regular text-white text-sm ml-2 font-semibold leading-tight uppercase"><span class="xxs:hidden sm:inline">My Classes</span></p></span></button></div>
<div class="${build.cls('MessagesButton_headerIconContainer')}"><a href="/inbox" target="_blank" data-testid="header_inbox_notification" class="${build.cls('MessagesButton_buttonWithoutCount')} ${build.cls('MessagesButton_LinkButton')}"><p class="font-display-regular text-white text-sm ml-4 font-semibold leading-tight uppercase"><span class="xxs:hidden sm:inline">Messages</span></p></a></div>
<div class="flex-grow"></div><div class="flex items-center"><button id="guide_anchor_header_alert" class="MuiButtonBase-root MuiIconButton-root ml-2 mt-[1px] MuiIconButton-sizeSmall" type="button" style="color:#fff"><span class="MuiIconButton-label"><span class="material-icons">notifications_none</span></span></button>
<button id="user_menu_button" class="MuiButtonBase-root MuiIconButton-root ${build.cls('Header_profileButton')} MuiIconButton-colorInherit" data-testid="user_menu" type="button"><span class="MuiIconButton-label"><span class="mr-1 text-sm leading-4 text-left font-display-regular md:ml-3"><span class="hidden md:inline-block" data-testid="user_name">Maya Torres</span><span class="hidden md:block"><p class="text-xs text-white">Student</p></span></span></span></button></div>
</div></header></div>`;
  const aside = sidebar ? `<aside aria-label="Main Sidebar" role="navigation" class="${build.cls('Sidebar_sidebarClose')}" style="width:70px;flex:none;background:#fff;border-right:1px solid var(--lms-grayE0,#e0e0e0)">${sidebar}</aside>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,400;0,600;0,700;1,400;1,500;1,600;1,700&display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons">
<style>${MUI}</style>${build.links(route)}</head><body>
<div id="__next"><div class="theme-gcu h-screen overflow-hidden"><div class="flex flex-col h-screen overflow-hidden bg-main text-main">${header}
<div class="flex flex-grow min-h-0 overflow-hidden"><div class="${build.cls('CourseLayout_layoutContainer')}">${aside}
<main id="CourseLayout--main" tabindex="-1" class="flex flex-col min-w-0 w-full h-full overflow-y-auto focus:outline-none"><div class="MuiContainer-root ${build.cls('CourseLayout_mainContainer')} flex flex-col flex-1 MuiContainer-maxWidthLg">${body}</div></main>
</div></div></div></div></div>
<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(next)}</script></body></html>`;
}

/**
 * Halo's Student Home: title, tabs, class cards. `bh`: Better Halo's card buttons (Calendar and three icons, with its
 * count badges from `badges`), as its own code adds them; Better Halo itself, when loaded, adds the rest (its tab row).
 */
// The sponsor logo's place on Student Home (Halo shows the school's sponsor there, Global Credit Union for GCU): a plain
// labelled stand-in image, not GCU's or the sponsor's artwork.
const SPONSOR = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="62" viewBox="0 0 300 62"><rect x="1" y="1" width="298" height="60" rx="6" fill="#fff" stroke="#c8ccd4"/><circle cx="32" cy="31" r="17" fill="#1d4f91"/><text x="58" y="30" font-family="Arial" font-size="17" font-weight="700" fill="#1d4f91">Global Credit Union</text><text x="58" y="47" font-family="Arial" font-size="11" fill="#8a8f98">sponsor logo (stand-in)</text></svg>')}`;
/** Halo's stage chip on a class card ("Topic 3"): the topic with work due this week (Monday to Sunday), else the next. */
function topicOf(c) {
  const now = Date.now();
  const d = new Date(now);
  const mon = now - (((d.getUTCDay() + 6) % 7) * 864e5);
  const week = (c.assessments || []).filter((a) => a.unitSequence != null && Date.parse(a.dueDate) >= mon - 864e5 && Date.parse(a.dueDate) < mon + 7 * 864e5);
  const next = (c.assessments || []).filter((a) => a.unitSequence != null && Date.parse(a.dueDate) >= now).sort((x, y) => Date.parse(x.dueDate) - Date.parse(y.dueDate));
  const pick = week[0] || next[0];
  return pick ? pick.unitSequence : null;
}
export function homePage(build, fx, { bh = false, badges = null, header = 'halo' } = {}) {
  const C = (n) => build.cls(n);
  const cards = fx.payload.classes
    .map((c) => {
      const color = fx.index.classes.find((k) => k.slug === c.slugId)?.hex ?? '#522398';
      const bhButtons = bh
        ? `<div class="flex flex-col better-halo-icon-buttons-container" style="margin-top:auto"><div class="flex flex-col gap-1 mt-auto"><div class="first-button-row"><a class="MuiButtonBase-root MuiButton-root MuiButton-contained mt-1 MuiButton-containedSecondary better-halo-icon-button" data-section="calendar" aria-label="Calendar" href="/courses/${c.slugId}" title="Calendar"><span class="MuiButton-label normal-case flex gap-2"><span class="material-icons MuiIcon-root MuiIcon-fontSizeSmall">event</span> Calendar</span></a></div><div class="icon-buttons-row">${[
            ['announcements', 'announcements', 'Announcements', `/courses/${c.slugId}/announcements`],
            ['gradebook', 'library_books', 'Gradebook', `/courses/${c.slugId}/student/gradebook`],
            ['discussion', 'message', 'Discussion Forums', `/courses/${c.slugId}/forums/discussion`],
          ]
            .map(([sec, icon, label, href]) => {
              const n = badges?.[c.slugId]?.[sec] ?? 0;
              return `<a class="MuiButtonBase-root MuiButton-root MuiButton-text mt-1 better-halo-icon-button better-halo-outline-button" data-section="${sec}" aria-label="${label}" title="${label}" href="${href}"><span class="MuiButton-label"><span class="material-icons MuiIcon-root MuiIcon-fontSizeSmall">${icon}</span></span>${n > 0 ? `<span class="better-halo-notification-badge" aria-label="(${n} notices)">${n}</span>` : ''}</a>`;
            })
            .join('')}</div></div></div>`
        : '';
      return `<div class="MuiGrid-root MuiGrid-item MuiGrid-grid-xs-12 MuiGrid-grid-md-6 MuiGrid-grid-lg-4"><div class="MuiPaper-root ${C('CourseCard_cardContainer')} MuiPaper-elevation1 MuiPaper-rounded" style="border-top:8px solid ${color}"><div class="p-5"${bh ? ' style="display:flex;flex-direction:column"' : ''}>
<div class="flex justify-between mb-3"><div class="${C('CourseCard_headerItem')}">${topicOf(c) ? `<span class="${C('Tag_tag')} font-semibold" style="background-color: var(--lms-colorLightBlue);">Topic ${topicOf(c)}</span>` : ''}<span class="${C('CourseCard_courseCode')}">${esc(c.classCode)}</span></div></div>
<h4 class="${C('CourseCard_courseTitle')}">${esc(c.name)}</h4>
<div class="${C('CourseCard_metaContainer')}"><time class="text-secondary text-sm">Sep 8 - Dec 20, 2026</time></div>
<div class="${C('CourseCard_metaItem')} text-secondary text-sm">Instructor</div>
<div class="${C('CourseCard_studentsList')}"><button id="Student-Roster--${c.id}" class="${C('CourseCard_rosterModalButton')}" type="button">28 students</button></div>
<hr class="mx-2 my-4"${bh ? ' style="display:none"' : ''}><div class="flex justify-center"${bh ? ' style="display:none"' : ''}><a class="MuiButtonBase-root MuiButton-root MuiButton-contained MuiButton-containedSecondary mt-1" href="/courses/${c.slugId}" data-testid="go_to_class"><span class="MuiButton-label">Go to Class</span></a></div>${bhButtons}
</div></div></div>`;
    })
    .join('');
  const tabs = `<div class="${C('Tabs_tabs')} mb-8 undefined" role="tablist"><button class="MuiButtonBase-root MuiButton-root MuiButton-text ${C('Tab_activeTab')} undefined" role="tab" aria-selected="true" tabindex="0" type="button"><span class="MuiButton-label"><span data-testid="current_classes">Current Classes (${fx.payload.classes.length})</span></span></button><button class="MuiButtonBase-root MuiButton-root MuiButton-text ${C('Tab_tab')} undefined" role="tab" aria-selected="false" tabindex="-1" type="button"><span class="MuiButton-label"><span data-testid="past_classes">Past Classes (0)</span></span></button></div>`;
  const body = `<div class="MuiContainer-root ${C('Home_container')} MuiContainer-maxWidthLg"><div id="Home--main" role="main" tabindex="-1" class="w-full focus:outline-none">
<header class="${C('PageTitle_headerContainer')} "><div class="flex items-center"><span class="${C('PageTitle_icon')}"><svg class="MuiSvgIcon-root" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"></path></svg></span><h1 class="${C('PageTitle_headerText')} focus:outline-none">Student home</h1></div>${header === 'none' ? '' : `<div><div class="my-auto mx-auto cursor-pointer"><a target="_blank" href="#sponsor"><img class="ml-2 mt-2" alt="Sponsors Logo: Global Credit Union - stand-in" src="${SPONSOR}" style="max-width:315px;max-height:62px"></a></div></div>`}${header === 'odd' ? '<div class="ml-4 text-sm">A new Halo notice</div>' : ''}</header>
${header === 'none' ? '' : '<div class="mb-4 text-sm text-gray-700"><div>Students will see their classes in Halo three days before each class’s start date</div><div>Missing a class? <a target="_blank" href="https://classschedule.gcu.edu" class="text-blue-600 hover:underline">View your full schedule.</a></div></div>'}
${tabs}
<section><div class="MuiGrid-root MuiGrid-container MuiGrid-spacing-xs-4">${cards}</div></section></div>
<footer class="py-10"><hr class="MuiDivider-root"><div class="pt-2 text-center"><p class="text-xs">Grand Canyon University © 2026 All Rights Reserved</p></div></footer></div>
<script>${HOME_TABS_JS.replace('%ON%', C('Tab_activeTab')).replace('%OFF%', C('Tab_tab'))}</script>`;
  return shell(build, '/', 'Halo Classes', body);
}

// Halo's Student Home tabs as its React code runs them (research A §1): one selected tab in state; choosing another
// re-renders both buttons (class, aria-selected, tabindex) and mounts that tab's panel as a new <section> at the end of
// #Home--main; choosing the tab already selected changes nothing.
// Halo also redraws Student Home without reloading (0.12.3 tests): My Classes and the HALO logo in its purple bar mount
// a fresh Student Home (new nodes, the same page), and moving to a class page and back does too (window.__hpGoClass).
const HOME_TABS_JS = `
(function () {
  const ON = '%ON%', OFF = '%OFF%';
  const box = document.getElementById('Home--main').parentElement;
  const fresh = box.innerHTML;
  function redraw() {
    box.innerHTML = fresh;
    bind();
  }
  document.getElementById('guide_anchor_header_myClasses').addEventListener('click', () => {
    if (location.pathname === '/') redraw();
  });
  document.getElementById('guide_anchor_header_logo').addEventListener('click', (e) => {
    e.preventDefault();
    history.pushState({}, '', '/');
    redraw();
  });
  window.__hpGoClass = (slug) => {
    history.pushState({}, '', '/courses/' + slug);
    box.innerHTML = '<div class="py-4"><h1>Calendar</h1><p>(a class page)</p></div>';
  };
  window.__hpRedraws = 0;
  bind();
  function bind() {
  window.__hpRedraws++;
  const main = document.getElementById('Home--main');
  const list = main.querySelector('[role="tablist"]');
  const tabs = [...list.querySelectorAll('[role="tab"]')];
  const panels = [main.querySelector('section').innerHTML, '<div class="MuiGrid-root MuiGrid-container MuiGrid-spacing-xs-4"><p class="p-4 text-secondary">You have no past classes.</p></div>'];
  let sel = 0;
  list.addEventListener('click', (e) => {
    const b = e.target.closest('[role="tab"]');
    const i = tabs.indexOf(b);
    if (i < 0 || i === sel) return;
    sel = i;
    tabs.forEach((t, k) => {
      t.className = 'MuiButtonBase-root MuiButton-root MuiButton-text ' + (k === sel ? ON : OFF) + ' undefined';
      t.setAttribute('aria-selected', String(k === sel));
      t.setAttribute('tabindex', k === sel ? '0' : '-1');
    });
    main.querySelector('section').remove();
    const s = document.createElement('section');
    s.innerHTML = panels[sel];
    main.appendChild(s);
  });
  }
})();
`;

/**
 * A discussion forum (`/courses/<slug>/forums/discussion/<forumId>`): the prompt, the posts (the student's own marked as
 * Halo marks them), and Halo's editor: a real TipTap v3 editor (the library Halo uses) with Halo's footer word count,
 * Halo's own autosave to its server 5 s after typing stops, and Halo's restore of that draft on the next load. Posting
 * goes to Halo's REST endpoint; on success Halo's toast shows and the editor closes. `state.forums[forumId]` holds the
 * posts and Halo's server drafts.
 */
export function discussionPage(build, fx, u, state) {
  const C = (n) => build.cls(n);
  const [, , slug, , , forumId] = u.pathname.split('/');
  const cls = fx.payload.classes.find((c) => c.slugId === decodeURIComponent(slug)) ?? fx.payload.classes[0];
  const f = forumState(state, fx, decodeURIComponent(forumId));
  const post = (p) => `<section id="scrollRef_${p.id}" class="${C('PostCard_postCardContainer')} block" data-testid="post_card_container_${p.id}">
<div class="${C('PostCard_postCardHeading')} ${C('forumCommonStyles_postSectionUserLabel')} ${p.mine ? C('forumCommonStyles_studentPostIndicator') : C('forumCommonStyles_studentPost')}"><div class="${C('PostCard_postMetaSection')}" data-testid="discussion_post_card_header"><div class="${C('PostCard_profileNameSection')}"><div class="${C('PostCard_userAvatar')}"><div class="MuiAvatar-root lms_avatar_for_user_=${p.userId}" data-testid="lms_avatar_for_user_=${p.userId}"></div>${p.mine ? '<svg aria-label="My Post" viewBox="0 0 24 24" width="16" height="16"><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" fill="#ffc200"/></svg>' : ''}<div class="${C('OverflowTooltip_overflowStyles')} ${C('PostCard_userName')}" role="presentation" data-testid="discussion_post_card_user_${p.userId}">${esc(p.author)}</div></div></div>
<div class="${C('PostCard_dateStatusSection')}"><div class="${C('PostCard_postDate')}" tabindex="-1"><p class="text-sm md:whitespace-nowrap xxs:whitespace-break text-gray21 text-xs sm:text-xs" data-testid="date_time_data">${esc(haloFull(p.date))}</p></div></div></div></div>
<div class="MuiCollapse-root MuiCollapse-entered ${C('PostCard_collapsibleContainer')}"><div class="MuiCollapse-wrapper"><div class="MuiCollapse-wrapperInner relative my-6"><div class="${C('PostCard_postMessage')}"><div class="${C('PostCard_postContent')}"><div class="${C('HTMLDescription_container')}" data-testid="description">${p.html}</div></div>
<div class="flex justify-between"><span class="flex justify-end self-end place-items-center ml-auto"><div class="${C('ReplyButton_replyButtonContainer')}"><button id="replyButton_${p.id}" class="MuiButtonBase-root MuiButton-root MuiButton-outlined ${C('ReplyButton_replyButton')}" data-testid="post_reply_button" aria-label="reply" type="button" data-post="${p.id}" data-author="${esc(p.author)}"><span class="MuiButton-label"><span class="${C('ReplyButton_replyButtonLabel')}">Reply</span></span></button></div></span></div>
<div class="toggleReplyEditor" data-for="${p.id}"></div></div>${(p.replies || []).map((r) => `<section class="${C('PostReplyCardContainer_postReplyCardContainer')}"><div class="${r.mine ? C('forumCommonStyles_studentPostIndicator') : C('forumCommonStyles_studentPost')}"><b>${esc(r.author)}</b> <p data-testid="date_time_data" class="text-xs">${esc(haloFull(r.date))}</p></div><div class="${C('HTMLDescription_container')}" data-testid="description">${r.html}</div></section>`).join('')}</div></div></div></section>`;
  const body = `<div class="${C('discussionId_discussionTopicHeader')}"><div class="${C('discussionId_header')} ${C('discussionId_student')} flex-wrap"><div class="w-full sm:w-5/12 mb-2 flex"><div class="${C('OverflowTooltip_overflowStyles')}" data-testid="discussion_selected_dq"><div class="max-w-xs xs:max-w-sm truncate">${esc(f.title)}</div></div></div></div></div>
<section class="${C('PostSection_postSectionContainer')}"><div class="${C('PostSection_postCardColumn')}"><div id="post_content_panel" data-testid="post_content_panel" class="${C('PostSection_postSectionWrapper')}" style="overflow:auto;max-height:calc(100vh - 160px)">
<section id="scrollRef_dq_description" class="${C('DiscussionDescriptionCard_descriptionCardWrapper')}"><div class="${C('DiscussionDescriptionCard_discussionHeaderMeta')}"><div class="${C('DiscussionDescriptionCard_topicName')}" data-testid="discussion_topic_title">${esc(f.title)}</div><span aria-label="Duration: Oct 26 to Nov 1, 2026"><time class="text-gray61 sm:text-lg"><span role="presentation">Oct 26</span><span class="px-1">-</span><span>Nov 1, 2026</span></time></span></div>
<div id="" class="px-0 sm:px-5 py-2 mx-5 sm:mx-0 ${C('DiscussionDescriptionCard_discussionHeaderDescription')}"><div class="my-3 text-sm leading-relaxed text-main" tabindex="-1"><div class="${C('HTMLDescription_container')} ${C('HTMLDescription_readableSpacing')} ${C('HTMLDescription_largeFont')}" data-testid="description">${f.prompt}</div></div></div>
<div class="flex justify-end"><button id="guide_anchor_discussion_reply" class="MuiButtonBase-root MuiButton-root MuiButton-contained ${C('DiscussionDescriptionCard_createNewPostButton')}" data-testid="discussion_submit_reply" aria-label="Reply to discussion" type="button"><span class="MuiButton-label">Reply to discussion</span></button></div></section>
<div id="postSection_scrollOffset"></div><div id="compose"></div>${f.posts.map(post).join('')}</div></div></section>
<div class="Toastify" id="SUCCESS"></div>
<script type="application/json" id="hp-forum">${JSON.stringify({ forumId: f.id, drafts: f.drafts, editors: { abort: C('PostEditor_abort'), submit: C('PostEditor_submit'), wrapper: C('PostEditor_postEditorWrapper'), actions: C('PostEditor_editorActions'), content: C('LMSTextEditor_editorContent'), mine: C('forumCommonStyles_studentPostIndicator'), toast: C('CustomToast_toast'), toastMsg: C('CustomToast_message'), desc: C('HTMLDescription_container'), reply: C('PostReplyCardContainer_postReplyCardContainer') } }).replace(/</g, '\\u003c')}</script>
<script type="module">${DISCUSSION_JS}</script>`;
  return shell(build, '/courses/[slugId]/forums/discussion/[discussionId]', `${cls.slugId.slice(0, 7)} ${f.title}`, `<div class="py-4">${body}</div>`);
}

/** The forum's posts and Halo's server drafts in the fake Halo (made-up classmates; the student is Maya). */
export function forumState(state, fx, forumId) {
  state.forums ??= {};
  if (!state.forums[forumId]) {
    const dq = fx.payload.classes.flatMap((c) => c.discussions || []).find((d) => d.forumId === forumId);
    state.forums[forumId] = {
      id: forumId,
      title: dq?.title ?? 'Discussion',
      prompt: state.prompt ?? dq?.description ?? '<p>Respond to the prompt.</p>',
      posts: [
        { id: `${forumId}-p1`, author: 'Jordan Ellis', userId: 'user-jordan', mine: false, date: '2026-10-26T16:20:00Z', html: '<p>I think listening well starts with asking a question back.</p>', replies: [] },
        { id: `${forumId}-p2`, author: 'Maya Torres', userId: 'user-maya', mine: true, date: '2026-10-26T18:05:00Z', html: '<p>Active listening means paraphrasing before answering.</p>', replies: [] },
      ],
      drafts: { reply: {}, post: null },
      sent: [],
    };
  }
  return state.forums[forumId];
}

/** Halo's forum REST calls on the fake orchestration server: drafts (isDraft=true) and real posts. */
export const FORUM_REST = [
    /\/forum\/post\/(send|reply)$/,
    async (route, r, cors, state) => {
      const body = r.postData() || '';
      const field = (k) => {
        const m = new RegExp(`name="${k}"\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--`).exec(body);
        return m ? m[1] : null;
      };
      const forumId = field('forumId');
      const f = state.forums?.[forumId];
      if (!f) return route.fulfill({ status: 404, headers: cors, body: '' });
      const draft = field('isDraft') === 'true';
      const parent = field('parentPostId');
      const content = field('content') || '';
      if (state.failPost && !draft) return route.fulfill({ status: 500, headers: cors, contentType: 'application/json', body: '{"message":"An error has occurred."}' });
      f.sent.push({ draft, parent, content, at: Date.now() });
      if (draft) {
        if (parent) f.drafts.reply[parent] = content;
        else f.drafts.post = content;
      } else {
        if (parent) {
          delete f.drafts.reply[parent];
          const p = f.posts.find((x) => x.id === parent);
          if (p) p.replies.push({ author: 'Maya Torres', userId: 'user-maya', mine: true, date: new Date().toISOString(), html: content });
        } else {
          f.drafts.post = null;
          f.posts.unshift({ id: `${forumId}-p${f.posts.length + 1}`, author: 'Maya Torres', userId: 'user-maya', mine: true, date: new Date().toISOString(), html: content, replies: [] });
        }
      }
      return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ id: `post-${Date.now()}` }) });
    },
];

// The page's own behaviour, as Halo's React code does it (research D): the editor mounts in the post's reply area (or
// the compose card), TipTap with CharacterCount gives the footer's "<n> words", Halo autosaves 5 s after the last
// change (isDraft=true), restores a saved draft on load, and on Post sends isDraft=false, shows its toast for 3 s and
// closes the editor; the reply appears under the post.
const DISCUSSION_JS = `
import { Editor } from 'https://esm.sh/@tiptap/core@3.32.0';
import StarterKit from 'https://esm.sh/@tiptap/starter-kit@3.32.0';
import { CharacterCount } from 'https://esm.sh/@tiptap/extensions@3.32.0';
const D = JSON.parse(document.getElementById('hp-forum').textContent);
const C = D.editors;
const ORCH = 'https://orchestration.halo.gcu.edu/api/v1/orchestrate/';
function mount(host, { parent = null, label = '', content = '' } = {}) {
  if (host.querySelector('[data-testid=post_text_editor]')) return;
  host.innerHTML = (label ? '<p class="pt-3 text-sm text-secondary">Replying to ' + label + '</p>' : '') +
    '<div class="' + C.wrapper + ' flex flex-col rounded box-shadow-light mt-2" data-testid="post_text_editor" style="border-radius:10px"><div class="tiptap-editor undefined relative"><div class="w-full bg-white rounded-lg border border-gray-200 shadow-sm false flex flex-col min-h-[276px]" role="presentation" style="min-height:200px">' +
    '<div role="toolbar" aria-label="Text editor toolbar" class="flex flex-col gap-y-2 py-2 border-b-2 border-gray-200 px-5 bg-white relative overflow-visible"><span class="text-xs text-secondary">Edit &nbsp; File &nbsp; Format &nbsp; Insert &nbsp; Table &nbsp; Help</span></div>' +
    '<div class="' + C.content + '" role="presentation" style="flex:1;overflow-y:auto"><div class="h-1" aria-hidden="true"></div><div class="ed"></div></div>' +
    '<div class="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-500 flex items-center focus:outline-none" tabindex="-1"><span class="mx-auto text-secondary text-sm" aria-keyshortcuts="Alt+0">Press Alt + 0 for help</span><span aria-live="polite" aria-atomic="true">0 words</span></div></div></div>' +
    '<div class="px-5 py-2"></div><hr><div class="' + C.actions + '"><div role="alert" aria-live="polite" class="flex items-center max-w-sm"><span class="ml-2 w-full whitespace-nowrap text-left" data-testid="discussion_last_saved_changes"><p class="ml-3 text-gray6C st"></p></span></div><div class="flex w-full justify-between"><div class="ml-auto"><div>' +
    '<button type="button" class="MuiButtonBase-root MuiButton-root MuiButton-outlined ' + C.abort + '" data-testid="post_text_editor_abort"><span class="MuiButton-label">Discard</span></button> ' +
    '<button type="button" class="MuiButtonBase-root MuiButton-root MuiButton-contained ' + C.submit + '" data-testid="post_text_editor_submit"' + (parent ? ' id="guide_anchor_forums_post"' : '') + '><span class="MuiButton-label">Post</span></button></div></div></div></div></div>';
  const words = host.querySelector('[aria-live=polite][aria-atomic=true]');
  const st = host.querySelector('.st');
  let timer = 0;
  const editor = new Editor({
    element: host.querySelector('.ed'),
    extensions: [StarterKit, CharacterCount],
    content,
    editorProps: { attributes: { class: 'tiptap ProseMirror focus:outline-none min-h-[300px] color-highlighter', translate: 'no', role: 'textbox' } },
    onUpdate: () => {
      words.textContent = (editor.storage.characterCount.words() || 0) + ' words';
      st.textContent = 'Unsaved Changes';
      clearTimeout(timer);
      timer = setTimeout(() => send(true), 5000);
    },
  });
  words.textContent = (editor.storage.characterCount.words() || 0) + ' words';
  async function send(isDraft) {
    const text = editor.getText().trim();
    if (!text) return false;
    const fd = new FormData();
    fd.append('content', editor.getHTML());
    fd.append('forumId', D.forumId);
    fd.append('isDraft', String(isDraft));
    if (parent) fd.append('parentPostId', parent);
    if (isDraft) st.textContent = 'Saving';
    const r = await fetch(ORCH + 'forum/post/' + (parent ? 'reply' : 'send'), { method: 'POST', body: fd, headers: { Authorization: 'Bearer test-auth' } }).catch(() => null);
    if (isDraft) st.textContent = r && r.ok ? 'Last saved changes now' : 'Your changes were not saved';
    return !!(r && r.ok);
  }
  host.querySelector('[data-testid=post_text_editor_abort]').addEventListener('click', () => { clearTimeout(timer); editor.destroy(); host.innerHTML = ''; });
  host.querySelector('[data-testid=post_text_editor_submit]').addEventListener('click', async () => {
    clearTimeout(timer);
    const html = editor.getHTML();
    if (!(await send(false))) {
      const t = document.createElement('div'); t.className = 'Toastify__toast--error'; t.textContent = 'An error has occurred.'; document.body.appendChild(t); setTimeout(() => t.remove(), 3000);
      return;
    }
    toast('Discussion post has been submitted');
    editor.destroy();
    host.innerHTML = '';
    if (parent) {
      const sec = document.createElement('section'); sec.className = C.reply;
      sec.innerHTML = '<div class="' + C.mine + '"><b>Maya Torres</b> <p data-testid="date_time_data" class="text-xs">now</p></div><div class="' + C.desc + '" data-testid="description">' + html + '</div>';
      host.parentElement.appendChild(sec);
    } else {
      const sec = document.createElement('section'); sec.setAttribute('data-testid', 'post_card_container_new'); sec.innerHTML = '<div class="' + C.mine + '"><b>Maya Torres</b></div><div class="' + C.desc + '" data-testid="description">' + html + '</div>';
      document.getElementById('compose').after(sec);
    }
  });
  return editor;
}
function toast(text) {
  const box = document.getElementById('SUCCESS');
  box.innerHTML = '<div class="Toastify__toast-container Toastify__toast-container--top-right"><div class="Toastify__toast Toastify__toast--success"><div role="alert" class="Toastify__toast-body toast-content"><div class="' + C.toast + '" role="alert" aria-live="assertive"><div class="' + C.toastMsg + '"><strong>Success</strong><div class="' + C.desc + '" data-testid="description">' + text + '</div></div></div></div></div></div>';
  setTimeout(() => (box.innerHTML = ''), 3000);
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-testid=post_reply_button]');
  if (b) mount(document.querySelector('.toggleReplyEditor[data-for="' + b.dataset.post + '"]'), { parent: b.dataset.post, label: b.dataset.author });
  if (e.target.closest('#guide_anchor_discussion_reply')) mount(document.getElementById('compose'), {});
});
// Halo restores its own server drafts on load: the reply editor reopens prefilled, the compose card comes back.
for (const [pid, html] of Object.entries(D.drafts.reply || {})) {
  const host = document.querySelector('.toggleReplyEditor[data-for="' + pid + '"]');
  if (host) mount(host, { parent: pid, label: 'Jordan Ellis', content: html });
}
if (D.drafts.post) mount(document.getElementById('compose'), { content: D.drafts.post });
window.__haloEditors = true;
`;

const TYPE_TITLE = { ASSIGNMENT: 'Assignment', DISCUSSION_QUESTION: 'Discussion Question', PARTICIPATION: 'Participation', QUIZ: 'Quiz', LTI: 'External Assessment (LTI)' };
const STATUS_BG = { PUBLISHED: '#2e7d32', SUBMITTED: '#3f51b6', LATE: '#ffbd16', OVERDUE: '#e91c0d', ACTIVE: '#e0e0e0', UPCOMING: '#e0e0e0', IN_PROGRESS: '#a4d4fc', REASSIGNED: '#7e57c3' };
const cap = (st) => st.split('_').map((w) => w[0] + w.slice(1).toLowerCase()).join(' ');
/** A made-up rubric for an assignment worth 40 points or more (the fake gateway's AssessmentRubric answer). */
export function rubricFor(a) {
  if (!a || a.type !== 'ASSIGNMENT' || (a.points || 0) < 40) return null;
  const p = a.points;
  const crit = [
    ['Content', 'Addresses every part of the prompt with accurate detail.', 0.5],
    ['Organization', 'Ideas follow a clear order with transitions.', 0.3],
    ['Mechanics', 'Grammar, spelling and APA format.', 0.2],
  ];
  return {
    id: `rub-${a.id}`,
    name: `${a.title} Rubric`,
    criteria: crit.map(([name, description, w], k) => {
      const pts = Math.round(p * w * 100) / 100;
      return {
        id: `cr-${a.id}-${k}`,
        name,
        description,
        points: pts,
        sequence: k + 1,
        achievementLevels: [
          ['No Submission', 0], ['Insufficient', 0.6], ['Approaching', 0.75], ['Acceptable', 0.85], ['Target', 1],
        ].map(([n, f], j) => ({ cellId: `cell-${a.id}-${k}-${j}`, name: n, description: `${n} for ${name.toLowerCase()}.`, points: Math.round(pts * f * 100) / 100, sequence: j + 1, value: null })),
      };
    }),
  };
}

/** One of Halo's assessment cards, as the topic page draws it (research C §1.4), with the student's status. */
function assessmentCard(build, slug, a, st) {
  const C = (n) => build.cls(n);
  const snakeT = snake(`accordion_${a.title}`);
  const status = st.status ?? a.status ?? 'UPCOMING';
  const done = !st.noStatus && ['LATE', 'SUBMITTED', 'PUBLISHED'].includes(status);
  const open = !done;
  const due = st.dueDate ?? a.dueDate;
  const rub = rubricFor(a);
  const btn = a.type === 'ASSIGNMENT' ? (done ? '<button class="MuiButtonBase-root MuiButton-root MuiButton-outlined MuiButton-sizeSmall" data-testid="dashboard_calendar_view_submission" type="button" data-open="' + a.id + '"><span class="MuiButton-label">View Submission</span></button>' : '<button class="MuiButtonBase-root MuiButton-root MuiButton-contained MuiButton-sizeSmall" data-testid="dashboard_calendar_submit_assignment" type="button" data-open="' + a.id + '"><span class="MuiButton-label">Submit Assignment</span></button>') : a.type === 'QUIZ' ? '<button class="MuiButtonBase-root MuiButton-root MuiButton-contained MuiButton-sizeSmall" data-testid="quiz_view" type="button"><span class="MuiButton-label">Go to Quiz</span></button>' : '<button class="MuiButtonBase-root MuiButton-root MuiButton-outlined MuiButton-sizeSmall" data-testid="dashboard_calendar_go_to_discussion" type="button"><span class="MuiButton-label">Go to Discussions</span></button>';
  return `<div class="${C('AssessmentCard_assessmentCardContainer')}" data-testid="assessment_card">
<div class="flex flex-col items-start justify-between pl-1 pr-4 mb-2 ls:flex-row ls:items-center"><div class="flex"><button class="MuiButtonBase-root MuiIconButton-root" id="${snakeT}" aria-expanded="${open}" aria-label="${open ? 'collapse' : 'expand'} ${esc(a.title)} assessment" type="button" data-toggle="1"><span class="MuiIconButton-label"><svg class="MuiSvgIcon-root ${open ? C('AssessmentCard_expandedIcon') : C('AssessmentCard_icon')}" viewBox="0 0 24 24"><path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"></path></svg></span></button>
<span class="rounded-full text-secondary z-base flex items-center"><span class="${C('CheckIcon_icon')} undefined">${done ? `<svg class="MuiSvgIcon-root MuiSvgIcon-fontSizeSmall ${C('CheckIcon_checkIcon')}" aria-label="Assessment Submitted" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"></path></svg>` : ''}<span class="${C('CheckIcon_content')}"><span aria-label="${TYPE_TITLE[a.type] ?? 'Assignment'}"><svg class="MuiSvgIcon-root" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="var(--lms-colorOrange,#ff9800)"></circle></svg></span></span></span></span>
<div class="flex flex-col justify-center"><h5 class="ml-3 text-main" id="${snakeT}" data-testid="assessment_title" tabindex="0">${esc(a.title)}</h5></div></div>
<div class="flex w-full p-3 xxs:flex-col lg:flex-row lg:justify-end lg:space-y-0 lg:gap-4">${btn}</div></div>
<div><div class="${C('ReadMore_readMoreContainer')}"><div class="MuiCollapse-container leading-snug ${open ? 'MuiCollapse-entered' : 'MuiCollapse-hidden'}"><div class="MuiCollapse-wrapper"><div class="MuiCollapse-wrapperInner"><div aria-labelledby="${snakeT}">
<div class="flex px-5 py-3 mt-3 bg-grayF2 justify-start flex-wrap">
<div class="flex-auto my-2 flex-row"><div class="mr-2 xxs:text-xs" tabindex="0"><p class="text-sm text-gray61 sm:text-xs xxs:text-xs" data-testid="date_time_label_start_date">Start Date</p><p class="text-sm md:whitespace-nowrap xxs:whitespace-break text-gray21 text-xs sm:text-xs" data-testid="date_time_data_start_date">${esc(haloFull(a.startDate))}</p></div></div>
<div class="flex-auto my-2 flex-row"><div class="mr-2 xss:text-xs" tabindex="0"><p class="text-sm text-gray61 sm:text-xs xxs:text-xs" data-testid="date_time_label_due_date">Due Date</p><p class="text-sm md:whitespace-nowrap xxs:whitespace-break text-gray21 text-xs sm:text-xs" data-testid="date_time_data_due_date">${esc(haloFull(due))}${st.accommodatedDueDate ? `<div class="mt-1 text-sm text-gray21"><span class="${C('FormattedDateTimeDisplay_dateWithPrefix')}"><span class="sr-only">, Accommodated Due Date, </span>${esc(haloFull(st.accommodatedDueDate).replace(/, (\d+:\d+ [AP]M)$/, ','))}</span> <span class="${C('FormattedDateTimeDisplay_timePart')}">${esc(haloFull(st.accommodatedDueDate).replace(/^.*, (\d+:\d+ [AP]M)$/, '$1'))}</span></div>` : ''}</p></div></div>
<div class="flex-auto my-2 flex-row" tabindex="0"><div class="xxs:text-xs text-secondary mr-2">Points</div><div class="xxs:text-xs text-main">${a.points}</div></div>
${rub ? `<div class="flex-auto my-2"><div class="text-xs text-secondary">Rubric</div><a class="MuiTypography-root MuiLink-root MuiLink-underlineHover text-sm text-left cursor-pointer text-blue" type="button" href="/courses/${slug}/rubrics/${a.id}" target="_blank" data-testid="print_rubric_link">View Rubric</a></div>` : ''}
${st.noStatus ? '' : `<div class="flex-auto my-2" tabindex="0"><div class="text-xs text-secondary">Status</div><div class="pt-1 text-sm text-main"><div class="${C('GradeStatusBadge_gradeStatusTag')}" data-testid="status" aria-label="${status}" style="color:${['SUBMITTED', 'OVERDUE', 'PUBLISHED', 'REASSIGNED'].includes(status) ? '#fff' : '#212121'};background-color:${STATUS_BG[status] ?? '#e0e0e0'}">${cap(status)}</div></div></div>`}</div>
<div id="${esc(a.title.toLowerCase())}" class="px-0 sm:px-5 py-2 mx-5 sm:mx-0"><div id="${snake(`Assessment Description${a.title}`)}" class="text-xs text-secondary">Assessment Description</div><div class="my-3 text-sm leading-relaxed text-main" tabindex="0"><div class="${C('HTMLDescription_container')} ${C('HTMLDescription_readableSpacing')}      undefined" data-testid="description">${a.description}</div></div></div>
</div></div></div></div></div></div></div>`;
}

/**
 * A topic page (`/courses/<slug>/course-units/<unitId>`): Halo's header (title, dates, Max Points), then the topic's
 * assessment cards with the student's own statuses (`state.grades[assessmentId]` overrides the fixture's), and the
 * assignment submission view when the address carries `#assignment-submission/<id>` (Halo shows it in place of the
 * page). Cards fold and unfold like Halo's.
 */
export function topicPage(build, fx, u, state) {
  const C = (n) => build.cls(n);
  const [, , slug, , unitId] = u.pathname.split('/');
  const cls = fx.payload.classes.find((c) => c.slugId === decodeURIComponent(slug)) ?? fx.payload.classes[0];
  const items = cls.assessments.filter((a) => a.unitId === decodeURIComponent(unitId)).map((a) => ({ ...a, ...(state.assessments?.[a.id] || {}) }));
  const unit = items[0]?.unit ?? 'Topic';
  const seq = items[0]?.unitSequence ?? 1;
  const max = items.reduce((n, a) => n + (a.points || 0), 0);
  const cards = items.map((a) => assessmentCard(build, cls.slugId, a, state.grades?.[a.id] ?? {})).join('');
  const body = `<div class="py-4"><div class="mb-6"><div class="${C('CourseUnitHeader_classroomCourseUnitHeader')}"><div class="${C('CourseUnitHeader_topicContainer')}"><div class="${C('CourseUnitHeader_titleContainer')}"><header class="${C('PageTitle_headerContainer')} ${C('CourseUnitHeader_pageTitleContainer')}"><div class="flex items-center"><span class="${C('PageTitle_icon')}"><abbr class="${C('CourseUnitHeader_courseUnitTitleAbbr')}" title="${esc(unit)}">T${seq}</abbr></span><h1 class="false ${C('CourseUnitHeader_pageTitle')} focus:outline-none">${esc(unit)}</h1></div></header></div>
<div class="flex flex-wrap sm:flex-nowrap leading-normal text-secondary items-center sm:ml-8 mt-2 sm:mt-0 mb-2"><div class="flex items-center pr-6"><span aria-label="Duration: Oct 26 to Nov 1, 2026"><time class="text-sm md:text-sm ml:text-lg pl-2 truncate"><span role="presentation">Oct 26</span><span class="px-1">-</span><span>Nov 1, 2026</span></time></span></div><div class="flex"><span class="text-secondary text-sm md:text-sm ml:text-lg truncate">Max Points:</span><span class="text-main text-sm md:text-sm ml:text-lg pl-1">${max}</span></div></div></div>
<div class="${C('Divider_simpleLine')} mt-2 mb-4"></div></div></div>
<section class="flex flex-col-reverse sm:flex-row"><div class="${C('CourseUnit_assessmentsContainer')}"><section class="mb-2"><div class="flex items-end justify-between section-header-wrapper"><div class="flex items-center p-2"><h4 id="guide_anchor_topic_assessments" data-testid="header">Assessments</h4></div></div><div class="${C('Divider_simpleLine')} mt-2 mb-4"></div></section>
<div id="assessments" aria-labelledby="guide_anchor_topic_assessments">${cards}</div></div></section></div>
<div class="Toastify" id="SUCCESS"></div>
<script type="application/json" id="hp-topic">${JSON.stringify({ slug: cls.slugId, classId: cls.id, items: items.map((a) => ({ id: a.id, title: a.title, description: a.description, due: (state.grades?.[a.id] ?? {}).dueDate ?? a.dueDate, type: a.type })), working: state.working ?? {}, submissions: state.submissions ?? {}, C: { filename: C('AssignmentSubmissionTable_filename'), toast: C('CustomToast_toast'), toastMsg: C('CustomToast_message'), desc: C('HTMLDescription_container') } }).replace(/</g, '\\u003c')}</script>
<script>${TOPIC_JS}</script>`;
  return shell(build, '/courses/[slugId]/course-units/[courseUnitId]', `${cls.slugId.slice(0, 7)} ${unit} `, body);
}
const TOPIC_JS = `
// Halo's assignment submission view (research C §3): "Submit Assignment" / "View Submission" push the address with
// #assignment-submission/<id> and Halo shows the view in place of the course layout; the attempt page has the due line,
// the working files table and Review & Submit; after a submit, "Submitted on …" and the submitted files.
(function () {
  const T = JSON.parse(document.getElementById('hp-topic').textContent);
  const ORCH = 'https://orchestration.halo.gcu.edu/api/v1/orchestrate/';
  const main = document.getElementById('CourseLayout--main');
  const topicHtml = main.innerHTML;
  const fmt = (t) => { const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Phoenix', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(new Date(t)); const g = (x) => (p.find((q) => q.type === x) || {}).value || ''; return g('month') + ' ' + g('day') + ', ' + g('year') + ', ' + g('hour') + ':' + g('minute') + ' ' + g('dayPeriod').toUpperCase(); };
  function view(id) {
    const a = T.items.find((x) => x.id === id);
    if (!a) return;
    const sub = T.submissions[id];
    const files = T.working[id] || [];
    main.innerHTML = '<div class="bg-grayF5 w-full h-full flex flex-col"><div class="w-full py-2 bg-white shadow-md px-6 flex items-center justify-between"><h1 class="text-2xl ml-4">Assignment Submission</h1><button type="button" data-testid="full_page_header_close_button" aria-label="close assignment submission" class="hp-close">✕</button></div>' +
      '<div class="p-6"><div class="bg-white shadow-md rounded p-6 mb-6"><div class="w-full"><div class="flex justify-between"><h1 class="text-xl md:text-2xl whitespace-nowrap">Attempt 1 of 1</h1><p class="text-black font-semibold text-lg mt-1">Due on: ' + fmt(a.due) + '</p></div>' +
      '<div data-testid="description" class="hp-desc" style="display:none">' + a.description + '</div>' +
      (sub ? '<div class="mt-6 flex items-center"><p class="text-lg font-bold ml-2">Submitted on ' + fmt(sub.submissionDate) + '</p></div><div role="table">' + sub.files.map((f) => '<div><a class="' + T.C.filename + '" href="/resource/r1">' + f.name + '</a></div>').join('') + '</div>'
        : '<h3 class="text-xl font-semibold">Uploaded Files</h3><div role="table" class="hp-working">' + files.map((f) => '<div role="row" class="hp-row"><a class="' + T.C.filename + '" href="/resource/w1">' + f + '</a></div>').join('') + '</div>' +
          '<button type="button" id="guide_anchor_submitAssignment_submit" data-testid="submit_assigment" class="MuiButtonBase-root MuiButton-root MuiButton-contained"><span class="MuiButton-label">Review &amp; Submit</span></button>') +
      '</div></div></div></div>';
  }
  function review(id) {
    const files = T.working[id] || [];
    const m = document.createElement('div');
    m.className = 'hp-review';
    m.setAttribute('role', 'dialog');
    m.style.cssText = 'position:fixed;inset:10% 25%;background:#fff;box-shadow:0 11px 15px rgba(0,0,0,.3);padding:24px;z-index:3100';
    m.innerHTML = '<h2>Review and Submit ' + T.items.find((x) => x.id === id).title + '</h2><p>Please review the selected files below.</p><h3>Submission Files</h3>' + files.map((f) => '<label class="flex items-center"><input type="checkbox" checked><span class="hp-file">' + f + '</span></label>').join('') + '<div><button type="button" class="hp-cancel">Cancel</button> <button type="button" class="hp-submit MuiButton-contained">Submit Assignment</button></div>';
    document.body.appendChild(m);
  }
  function toast(text) {
    let box = document.getElementById('SUCCESS');
    if (!box) { box = document.createElement('div'); box.id = 'SUCCESS'; box.className = 'Toastify'; document.body.appendChild(box); }
    box.innerHTML = '<div class="Toastify__toast Toastify__toast--success"><div role="alert" class="' + T.C.toast + '"><div class="' + T.C.toastMsg + '"><strong>Success</strong><div class="' + T.C.desc + '" data-testid="description">' + text + '</div></div></div></div>';
    setTimeout(() => (box.innerHTML = ''), 3000);
  }
  const go = () => { const m = /#assignment-submission\\/([^/?#]+)/.exec(location.hash); if (m) view(decodeURIComponent(m[1])); };
  document.addEventListener('click', async (e) => {
    const open = e.target.closest('[data-open]');
    if (open) { history.pushState({}, '', location.pathname + '#assignment-submission/' + open.dataset.open); go(); return; }
    if (e.target.closest('.hp-close')) { history.pushState({}, '', location.pathname); main.innerHTML = topicHtml; return; }
    const id = (/#assignment-submission\\/([^/?#]+)/.exec(location.hash) || [])[1];
    if (e.target.closest('#guide_anchor_submitAssignment_submit')) review(id);
    if (e.target.closest('.hp-cancel')) document.querySelector('.hp-review').remove();
    if (e.target.closest('.hp-submit')) {
      const r = await fetch(ORCH + 'resource/assignment_resource/sub-' + id + '/submit', { method: 'POST', body: JSON.stringify({ assessmentId: id }), headers: { 'content-type': 'application/json', Authorization: 'Bearer test-auth' } });
      document.querySelector('.hp-review').remove();
      if (r.ok) { const j = await r.json(); T.submissions[id] = j; toast('Assignment has been submitted.'); view(id); }
    }
  });
  go();
})();
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-toggle]');
  if (t) {
    const card = t.closest('[data-testid=assessment_card]');
    const col = card.querySelector('.MuiCollapse-container');
    const open = col.classList.contains('MuiCollapse-entered');
    col.classList.toggle('MuiCollapse-entered', !open);
    col.classList.toggle('MuiCollapse-hidden', open);
    t.setAttribute('aria-expanded', String(!open));
  }
});
`;

/** The fake gateway's answers for the topic page's features, from the fixture and `state`. */
export function topicGateway(fx) {
  const find = (id) => fx.payload.classes.flatMap((c) => c.assessments).find((a) => a.id === id);
  return {
    AssessmentRubric: (v) => {
      const a = find(v.assessmentId);
      return { assessmentRubric: a ? { id: a.id, title: a.title, description: a.description, points: a.points, rubric: rubricFor(a) } : null };
    },
    CourseClassAssessment: (v, state) => {
      const a0 = find(v.assessmentId);
      const a = a0 ? { ...a0, ...(state.assessments?.[a0.id] || {}) } : null;
      return { assessment: a ? { id: a.id, title: a.title, description: a.description, startDate: a.startDate, dueDate: a.dueDate, points: a.points, accommodatedDueDate: null, requiresLopesWrite: false, isGroupEnabled: false, type: a.type, isAlternate: false, parentId: null, attachments: [], rubric: null } : null };
    },
    AssessmentFeedback: (v, state) => {
      const f = state.feedback?.[v.assessmentId];
      return { assessmentFeedback: f === undefined ? null : { id: `g-${v.assessmentId}`, gradedDate: f?.gradedDate ?? '2026-10-20T18:00:00Z', finalComment: f === null ? null : { comment: f.comment } } };
    },
    AssignmentSubmission: (v, state) => {
      const s = state.submissions?.[v.courseClassAssessmentId];
      return { assignmentSubmission: s ? { id: `sub-${v.courseClassAssessmentId}`, status: s.status ?? 'SUBMITTED', dueDate: null, isEverReassigned: false, accommodatedDueDate: null, submissionDate: s.submissionDate, resubmissionStatus: null, user: null, history: [], courseClassAssessmentGroup: null, resources: (s.files || []).map((f, k) => ({ id: `asr-${k}`, isFinal: f.final !== false, percentQuotedText: null, similarityScore: null, similarityReportStatusEnum: null, uploadDate: s.submissionDate, uploadedBy: null, resource: { id: `res-${k}`, kind: 'FILE', name: f.name, type: 'assignment_submission', active: true, context: null, description: null, embedReady: 'false' } })) } : null };
    },
  };
}

/**
 * A class's home page (`/courses/<slug>`, Halo's "Calendar"): Halo's DashboardCalendar (research B): the weeks pager,
 * "Current (Week N)", "Show 1 Week | 2 Weeks | All" (2 Weeks on every visit), and week rows with one bar per item from
 * its start day to its due day (the student's due date), coloured by type. Monday weeks from the class's start.
 */
export function classPage(build, fx, u, state) {
  const C = (n) => build.cls(n);
  const slug = decodeURIComponent(u.pathname.split('/')[2]);
  const cls = fx.payload.classes.find((c) => c.slugId === slug) ?? fx.payload.classes[0];
  const events = cls.assessments.map((a) => ({ id: a.id, title: a.title, type: a.type, start: a.startDate, due: state.grades?.[a.id]?.dueDate ?? a.dueDate, status: state.grades?.[a.id]?.status ?? a.status }));
  const data = { start: cls.startDate, end: cls.endDate, events, classes: { duration: [1, 2, 3, 4, 5, 6, 7].map((n) => C(`WeeklyCalendar_duration${n}`)), offset: [1, 2, 3, 4, 5, 6].map((n) => C(`WeeklyCalendar_offset${n}`)), bar: { ASSIGNMENT: C('AssessmentBar_assignmentBar'), DISCUSSION_QUESTION: C('AssessmentBar_discussionBar'), PARTICIPATION: C('AssessmentBar_participationBar'), LTI: C('AssessmentBar_ltiBar'), QUIZ: C('AssessmentBar_quizBar') } }, C: Object.fromEntries(['WeeklyCalendar_calendarWrapper', 'sizes_calendarRow', 'DayHeader_header', 'HeaderRow_currentDay', 'HeaderRow_borderBottom', 'ContentRow_contentRowWrapper', 'ContentRow_contentRow', 'DayContent_content', 'ContentRow_currentDay', 'ContentRow_eventContainer', 'WeeklyCalendar_eventBar', 'AssessmentBar_customEventBar', 'WeeklyCalendar_eventInner', 'AssessmentBar_assessmentBarContent', 'AssessmentBar_assessmentBarLeft', 'AssessmentBar_assessmentBarTitle', 'OverflowTooltip_overflowStyles', 'AssessmentBar_pointer', 'AssessmentBar_leftArrow', 'AssessmentBar_rightArrow', 'AssessmentBarGroup_btnFocused', 'sizes_radiusTopLeft', 'sizes_radiusTopRight', 'DashboardCalendar_pagination', 'DashboardCalendar_weekViewMode', 'DashboardCalendar_allWeekViewMode', 'DashboardCalendar_btn', 'DashboardCalendar_buttonGroup', 'DashboardCalendar_btnGroup'].map((n) => [n, C(n)])) };
  const body = `<div class="py-4 flex-1"><header class="${C('PageTitle_underlinedHeaderContainer')}"><div class="flex items-center"><span class="${C('PageTitle_icon')}"><svg class="MuiSvgIcon-root" viewBox="0 0 24 24"><path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"></path></svg></span><h1 class="${C('PageTitle_headerText')} focus:outline-none">Calendar</h1></div></header>
<div id="calendar-container" class="MuiPaper-root py-6 px-4 MuiPaper-elevation3 MuiPaper-rounded"></div>
<script type="application/json" id="hp-cal">${JSON.stringify(data).replace(/</g, '\\u003c')}</script><script>${CALENDAR_JS}</script></div>`;
  return shell(build, '/courses/[slugId]', `${cls.slugId.slice(0, 7)} Calendar`, body, { sidebar: '<div style="height:100%"></div>' });
}
// Halo's DashboardCalendar, as its code draws it for a student (research B §2-3): React state for 1/2/All (2 by
// default, never saved), the selected week (the current one at first), Phoenix days.
const CALENDAR_JS = `
(function () {
  const D = JSON.parse(document.getElementById('hp-cal').textContent);
  const K = D.C;
  const TZ = 'America/Phoenix';
  const dayKey = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
  const dayNum = (k) => Date.parse(k + 'T00:00:00Z') / 864e5;
  const fromNum = (n) => new Date(n * 864e5).toISOString().slice(0, 10);
  const start = dayNum(dayKey(D.start));
  const wd = new Date(fromNum(start) + 'T12:00:00Z').getUTCDay();
  const grid0 = start - ((wd + 6) % 7);
  const end = dayNum(dayKey(D.end));
  const weeks = [];
  for (let d = grid0; d <= end; d += 7) weeks.push([0, 1, 2, 3, 4, 5, 6].map((k) => d + k));
  const today = dayNum(dayKey(Date.now()));
  let cur = Math.max(0, weeks.findIndex((w) => w[0] <= today && today <= w[6]));
  let sel = cur;
  let mode = 2;
  const fmt = (n, o) => new Intl.DateTimeFormat('en-US', Object.assign({ timeZone: 'UTC' }, o)).format(new Date(fromNum(n) + 'T12:00:00Z'));
  function render() {
    const lo = mode === 'all' ? 0 : Math.max(0, sel - mode + 1);
    const hi = mode === 'all' ? weeks.length - 1 : Math.min(weeks.length - 1, lo + mode - 1);
    const pager = mode === 'all' ? '' : '<span>Weeks</span><nav class="MuiPagination-root" aria-label="pagination navigation"><ul class="MuiPagination-ul">' + weeks.map((w, i) => '<li><button type="button" class="hp-page" data-i="' + i + '" aria-label="' + (i === sel ? 'Week ' + (i + 1) : 'Go to week ' + (i + 1)) + '"' + (i === sel ? ' aria-current="true"' : '') + '>' + (i + 1) + '</button></li>').join('') + '</ul></nav>';
    const opt = (v, label, id, aria) => '<button type="button" id="' + id + '" data-testid="dashboard_calendar_num_weeks_' + v + '" aria-label="' + aria + '" class="MuiButtonBase-root MuiButton-root MuiButtonGroup-grouped MuiButtonGroup-groupedHorizontal MuiButton-sizeSmall ' + (String(mode) === String(v) ? 'MuiButton-contained MuiButton-containedSecondary' : 'MuiButton-outlined MuiButton-outlinedSecondary MuiButtonGroup-groupedOutlined MuiButtonGroup-groupedOutlinedHorizontal') + '"><span class="MuiButton-label">' + label + '</span></button>';
    let html = '<div class="mb-5 flex flex-wrap items-center justify-start"><div class="' + K.DashboardCalendar_pagination + '">' + pager + '</div><div class="' + K.DashboardCalendar_weekViewMode + ' ' + (mode === 'all' ? K.DashboardCalendar_allWeekViewMode : 'false') + '">' + (mode === 'all' ? '' : '<button type="button" class="MuiButtonBase-root MuiButton-root MuiButton-outlined MuiButton-outlinedSecondary MuiButton-sizeSmall ' + K.DashboardCalendar_btn + '" data-testid="dashboard_calendar_current_week" aria-label="Go to current week ' + (cur + 1) + '"><span class="MuiButton-label">Current (Week ' + (cur + 1) + ')</span></button>') +
      '<div class="' + K.DashboardCalendar_buttonGroup + '"><span class="hidden md:block text-secondary text-sm mr-2">Show</span><div><div role="group" class="MuiButtonGroup-root ' + K.DashboardCalendar_btnGroup + '">' + opt(1, '1 Week', 'guide_anchor_dashboard_oneWeek', '1 Week group 1') + opt(2, '2 Weeks', 'guide_anchor_dashboard_twoWeek', '2 Weeks group 2') + opt('all', 'All', 'guide_anchor_dashboard_allWeek', mode === 'all' ? 'expand All' : 'collapse All') + '</div></div></div></div></div>';
    html += '<div id="guide_anchor_dashboard_calendar" class="' + K.WeeklyCalendar_calendarWrapper + '">';
    for (let wi = lo; wi <= hi; wi++) {
      const w = weeks[wi];
      html += '<div><div class="' + K.sizes_calendarRow + '">' + w.map((d, k) => '<div class="' + K.DayHeader_header + (d === today ? ' ' + K.HeaderRow_currentDay : '') + (wi === lo && k === 0 ? ' ' + K.sizes_radiusTopLeft : '') + (wi === lo && k === 6 ? ' ' + K.sizes_radiusTopRight : '') + (wi > lo ? ' ' + K.HeaderRow_borderBottom : '') + '"><span class="font-semibold">' + fmt(d, { weekday: 'short' }) + ', </span><span class="font-extralight">' + fmt(d, { month: 'short', day: 'numeric' }) + '</span></div>').join('') + '</div>';
      html += '<div class="' + K.ContentRow_contentRowWrapper + '"><div><div class="' + K.sizes_calendarRow + ' ' + K.ContentRow_contentRow + '">' + w.map((d) => '<div class="' + K.DayContent_content + (d === today ? ' ' + K.ContentRow_currentDay : '') + '"></div>').join('') + '</div><div class="' + K.ContentRow_eventContainer + '"><div>';
      for (const e of D.events) {
        const s0 = dayNum(dayKey(e.start)), e0 = dayNum(dayKey(e.due));
        if (e0 < w[0] || s0 > w[6] || s0 > e0) continue;
        const a = Math.max(s0, w[0]) - w[0], b = Math.min(e0, w[6]) - w[0];
        html += '<div><button class="' + K.WeeklyCalendar_eventBar + ' ' + D.classes.duration[b - a] + ' ' + (a ? D.classes.offset[a - 1] : '') + ' relative ' + K.AssessmentBarGroup_btnFocused + '" aria-haspopup="true" aria-expanded="false" tabindex="0" data-testid="dashboard_calendar_assessment=' + e.id + '"><div class="MuiBox-root ' + K.AssessmentBar_customEventBar + ' ' + K.WeeklyCalendar_eventInner + ' ' + (D.classes.bar[e.type] || D.classes.bar.ASSIGNMENT) + ' ' + K.AssessmentBar_pointer + '"><div class="' + K.AssessmentBar_assessmentBarContent + '"><div class="' + K.AssessmentBar_assessmentBarLeft + '"><div class="' + K.AssessmentBar_assessmentBarTitle + '"><div class="' + K.OverflowTooltip_overflowStyles + ' min-w-0" role="presentation">' + e.title.replace(/</g, '&lt;') + '</div></div></div></div></div></button></div>';
      }
      html += '</div></div></div></div></div>';
    }
    html += '</div>';
    document.getElementById('calendar-container').innerHTML = html;
  }
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-testid^="dashboard_calendar_num_weeks_"]');
    if (b) {
      const v = b.getAttribute('data-testid').replace('dashboard_calendar_num_weeks_', '');
      mode = v === 'all' ? 'all' : Number(v);
      if (mode === 'all') sel = 0; else if (sel === 0) sel = cur;
      render();
    }
    const pg = ev.target.closest('.hp-page');
    if (pg) { sel = Number(pg.dataset.i); render(); }
    if (ev.target.closest('[data-testid="dashboard_calendar_current_week"]')) { sel = cur; render(); }
  });
  render();
})();
`;

/** Halo's submit, on the fake orchestration server: the submission is on file with the working files, now. */
export const SUBMIT_REST = [
  /\/resource\/assignment_resource\/sub-([^/]+)\/submit$/,
  async (route, r, cors, state) => {
    const id = /sub-([^/]+)\/submit$/.exec(new URL(r.url()).pathname)[1];
    const sub = { submissionDate: new Date().toISOString(), files: (state.working?.[id] || []).map((name) => ({ name })) };
    state.submissions ??= {};
    state.submissions[id] = sub;
    state.grades ??= {};
    state.grades[id] = { ...(state.grades[id] || {}), status: 'SUBMITTED' };
    return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(sub) });
  },
];

/** The fake gateway's participation (Halo's participationPosts): the student's posts in the window, by Halo's day. */
export function participationGateway() {
  return {
    StudentParticipation: (v, state) => {
      const a = Date.parse(v.startDate);
      const b = Date.parse(v.endDate);
      const posts = (state.participation?.[v.courseClassId] ?? []).filter((t) => Date.parse(t) >= a && Date.parse(t) <= b);
      const by = {};
      for (const t of posts) (by[new Intl.DateTimeFormat('en-CA', { timeZone: PHX }).format(new Date(t))] ??= []).push(t);
      return { participationPosts: Object.entries(by).map(([date, list]) => ({ date, posts: list.map((t, i) => ({ id: `pp-${date}-${i}`, publishDate: t })), substantivePosts: 0, nonSubstantivePosts: 0 })) };
    },
  };
}

/** The fake gateway's sidebar counts (Halo's own two questions), from `state.counts[slug]`. */
export function countsGateway(fx) {
  const slugOf = (id) => fx.payload.classes.find((c) => c.id === id)?.slugId;
  return {
    SidebarForumNotifications: (v, state) => {
      const c = state.counts?.[slugOf(v.classId)] ?? { DQ: 0, IDQ: 0, CQ: 0, GROUP: 0, ANNOUNCEMENTS: 0 };
      const t = (n) => ({ classes: [{ count: String(n ?? 0) }] });
      return { classes: { forumTypes: { DQ: t(c.DQ), IDQ: t(c.IDQ), CQ: t(c.CQ), GROUP: t(c.GROUP), ANNOUNCEMENTS: t(c.ANNOUNCEMENTS) } } };
    },
    SidebarGradebookNotifications: (v, state) => ({ gradebook: { count: state.counts?.[v.slugId]?.gradebook ?? 0 } }),
  };
}

/** The fake gateway's StudentAssessmentDetails: the student's grade rows (due dates, statuses) for a class. */
export function gradesGateway(fx) {
  return {
    StudentAssessmentDetails: (v, state) => {
      const c = fx.payload.classes.find((k) => k.slugId === v.courseClassSlugId);
      if (!c) return { assessmentGrades: null };
      const rows = c.assessments.filter((a) => !v.courseUnitId || a.unitId === v.courseUnitId).map((a) => {
        const g = state.grades?.[a.id] ?? {};
        return { assessment: { id: a.id, title: a.title }, userLastSeenDate: null, dueDate: g.dueDate ?? a.dueDate, accommodatedDueDate: g.accommodatedDueDate ?? null, id: `g-${a.id}`, status: g.status ?? a.status, userQuizAssessment: null, isEverReassigned: false, history: [] };
      });
      return { assessmentGrades: [{ grades: rows }] };
    },
  };
}

/**
 * A class's announcements (`/courses/<slug>/announcements`), as Halo draws them (research E §1): Active / Inactive
 * tabs, one card per announcement with its author and date band, the body through Halo's HTML renderer (its links get
 * Halo's link class; plain-text addresses stay text), and attachments as links to Halo's file viewer.
 */
export function announcementsPage(build, fx, u, state) {
  const C = (n) => build.cls(n);
  const slug = decodeURIComponent(u.pathname.split('/')[2]);
  const cls = fx.payload.classes.find((c) => c.slugId === slug) ?? fx.payload.classes[0];
  const anns = state.announcements?.[slug] ?? cls.announcements;
  const linkCls = C('HTMLDescription_link');
  const body = (html) => html.replace(/<a href="([^"]+)">/g, `<a href="$1" target="_blank" rel="noopener noreferrer" class="${linkCls}" style="color: var(--lms-hyperlinkColor); display: inline-block; margin: 0; padding: 0;">`);
  const cards = anns
    .map((a) => `<div class="${C('AnnouncementCard_announcementCardContainer')}" id="scrollRef_${a.id}"><div data-testid="announcement_header"><div class="rounded-t bg-white items-baseline sm:items-center" data-testid="assessment_card"><div class="flex justify-between items-start sm:items-center px-3 py-2"><div class="flex flex-col sm:flex-row justify-between w-full"><div class="flex"><div class="flex flex-col self-center justify-center"><h3 id="${snake(`accordion_${a.title}`)}" class="flex text-main self-center text-wrap" data-testid="assessment_title" tabindex="-1">${esc(a.title)}</h3></div></div></div></div>
<div class="sm:flex-row sm:items-center sm:w-auto"><div class="${C('ReadMore_readMoreContainer')}"><div class="MuiCollapse-root MuiCollapse-entered leading-snug"><div class="MuiCollapse-wrapper"><div class="MuiCollapse-wrapperInner"><div>
<div class="relative rounded-t bg-grayF2 flex flex-col sm:flex-row px-3 py-3 sm:items-center"><div class="flex items-center"><span class="ml-2 items-center mb-1 mt-2 w-[12rem]">${esc(a.author)}</span></div><div class="sm:ml-8 sm:mr-4 mt-2"><div class="flex flex-col sm:mt-0 sm:mx-4"><p class="mb-1 text-sm text-gray61 sm:block">Published Date</p><p class="text-sm whitespace-nowrap ${C('AnnouncementCard_dateStyle')}">${esc(haloFull(a.publishedAt))}</p></div></div></div>
<div class="${C('AnnouncementCard_announcementDescriptionContainer')} m-3"><div class="${C('HTMLDescription_container')}      undefined  " data-testid="description">${body(a.content)}</div></div>
<div class="my-4 px-3">${(a.resources || []).length ? `<div><span class="text-sm text-secondary">Attachments</span><div class="flex flex-wrap items-baseline w-full mb-2 mr-1">${a.resources.map((r) => `<div class="${C('AttachmentPreview_linkContainer')} false undefined"><a class="MuiTypography-root MuiLink-root MuiLink-underlineNone MuiTypography-colorPrimary" href="/resource/${r.id}" target="_blank" tabindex="0" data-testid="chatAttachment" aria-label="Opens ${esc(r.name)} external link in a new tab" style="color: var(--lms-hyperlinkColor);"><span class="w-full mt-2 mr-4 text-left break-words text-hyperlink">${esc(r.name)}</span></a></div>`).join('')}</div></div>` : ''}</div>
</div></div></div></div></div></div></div></div></div>`)
    .join('');
  const page = `<div class="py-4 flex-1"><header class="${C('PageTitle_headerContainer')}"><div class="flex items-center"><h1 class="${C('PageTitle_headerText')}">Announcements</h1></div></header><div class="relative flex flex-col justify-between"><div class="${C('Tabs_tabs')} mb-8 undefined" role="tablist"><button class="MuiButtonBase-root MuiButton-root MuiButton-text ${C('Tab_activeTab')}" role="tab" aria-selected="true" data-testid="published_tab" type="button"><span class="MuiButton-label">Active (${anns.length})</span></button></div><section><div id="scrollRef_announcement_list">${cards}</div></section></div></div>`;
  return shell(build, '/courses/[slugId]/announcements', `${slug.slice(0, 7)} Announcements `, page, { sidebar: '<div></div>' });
}

/** A one-page PDF that says "Halo+ test file" (the fake Halo's file download). */
export const TINY_PDF = Buffer.from(`%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj
4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
5 0 obj<</Length 52>>stream
BT /F1 24 Tf 72 700 Td (Halo+ test file) Tj ET
endstream endobj
trailer<</Root 1 0 R>>
%%EOF`);

/** Halo's file service on the fake orchestration server: a PDF for any id, unless `state.notPdf` names it. */
export const FILE_REST = [
  /\/resource\/[a-z_]+\/download\/[^/?]+/,
  async (route, r, cors, state) => {
    const id = /\/download\/([^/?]+)/.exec(new URL(r.url()).pathname)[1];
    state.downloads = (state.downloads || 0) + 1;
    if (!/Bearer test-auth/.test(r.headers().authorization || '')) return route.fulfill({ status: 401, headers: cors, body: '' });
    if (state.notPdf?.includes(decodeURIComponent(id))) return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/octet-stream' }, body: Buffer.from('PK\u0003\u0004 not a pdf') });
    return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/pdf' }, body: TINY_PDF });
  },
];

/** The fake gateway's GetResource: a file's record (its name, the service it lives in, whether Halo can preview it). */
export function resourceGateway(fx) {
  return {
    GetResource: (v, state) => {
      const all = fx.payload.classes.flatMap((c) => [...c.announcements.flatMap((a) => a.resources || []), ...(c.resources || []).flatMap((r) => r.files || [])]);
      const f = all.find((x) => x.id === v.id) ?? state.resources?.[v.id];
      return { getResourceById: f ? { id: f.id, kind: 'FILE', name: f.name, type: f.type || 'forum_resource', active: true, context: null, description: null, embedReady: 'false' } : null };
    },
  };
}

/** Everything one test needs: Halo's look, the pages, a fake Halo that records calls. */
export async function standIn(ctx, fx, opts = {}) {
  const build = await haloBuild();
  const calls = { gateway: [], rest: [], session: 0 };
  const state = { bh: !!opts.bh, badges: opts.badges ?? null, failGateway: false, gateway: opts.gateway ?? {}, pages: opts.pages ?? {} };
  // Halo's own servers allow Halo's page these headers (a wildcard would not cover Authorization).
  const cors = { 'access-control-allow-origin': 'https://halo.gcu.edu', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'authorization, contexttoken, content-type, transaction-id, current-class-slug-id, current-course-class-id', 'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS' };
  await ctx.route('https://halo.gcu.edu/**', async (route) => {
    const u = new URL(route.request().url());
    // Halo's public files (stylesheets, fonts, page code) come from Halo itself, once, then from disk (their names carry
    // their content's hash, so a kept copy is the same file).
    if (u.pathname.startsWith('/_next/static/')) {
      const file = `.scratch/halo-static/${createHash('sha1').update(u.pathname).digest('hex')}`;
      if (existsSync(file)) {
        const { type, body } = JSON.parse(readFileSync(file, 'utf8'));
        return route.fulfill({ status: 200, contentType: type, body: Buffer.from(body, 'base64') });
      }
      const res = await route.fetch().catch(() => null);
      if (!res) return route.abort();
      const buf = await res.body();
      if (res.ok() && !u.pathname.endsWith('_buildManifest.js')) {
        mkdirSync('.scratch/halo-static', { recursive: true });
        writeFileSync(file, JSON.stringify({ type: res.headers()['content-type'] || 'application/octet-stream', body: buf.toString('base64') }));
      }
      return route.fulfill({ response: res, body: buf });
    }
    if (u.pathname === '/api/auth/session') {
      calls.session += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authToken: 'test-auth', contextToken: 'test-context', userId: 'user-maya', expires: '2099-01-01T00:00:00Z' }) });
    }
    if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    const page = Object.entries(state.pages).find(([re]) => new RegExp(re).test(u.pathname));
    if (page) return route.fulfill({ status: 200, contentType: 'text/html', body: page[1](build, fx, u, state) });
    if (u.pathname === '/' || u.pathname === '') return route.fulfill({ status: 200, contentType: 'text/html', body: homePage(build, fx, { bh: state.bh, badges: state.badges, header: state.homeHeader || 'halo' }) });
    return route.fulfill({ status: 200, contentType: 'text/html', body: shell(build, '/courses/[slugId]', 'Halo', `<div class="py-4"><h1 class="${build.cls('PageTitle_headerText')}">Page</h1></div>`) });
  });
  // The editor library the discussion stand-in loads (TipTap, from a public module CDN): kept on disk after the first
  // fetch, so every page and browser gets it at once and the same.
  await ctx.route('https://esm.sh/**', async (route) => {
    const key = createHash('sha1').update(route.request().url()).digest('hex');
    const file = `.scratch/esm-cache/${key}`;
    if (existsSync(file)) {
      const { type, body } = JSON.parse(readFileSync(file, 'utf8'));
      return route.fulfill({ status: 200, contentType: type, headers: { 'access-control-allow-origin': '*' }, body });
    }
    const res = await route.fetch();
    const body = await res.text();
    if (res.ok()) {
      mkdirSync('.scratch/esm-cache', { recursive: true });
      writeFileSync(file, JSON.stringify({ type: res.headers()['content-type'] || 'application/javascript', body }));
    }
    return route.fulfill({ response: res, body });
  });
  // Halo's fonts (Open Sans and Material Icons, from Google Fonts as on Halo): kept on disk the same way, since a slow
  // font request holds the page's load event and timed tests out (2026-10-27).
  for (const host of ['https://fonts.googleapis.com/**', 'https://fonts.gstatic.com/**'])
    await ctx.route(host, async (route) => {
      const file = `.scratch/font-cache/${createHash('sha1').update(route.request().url()).digest('hex')}`;
      const headers = { 'access-control-allow-origin': '*' };
      if (existsSync(file)) {
        const { type, body } = JSON.parse(readFileSync(file, 'utf8'));
        return route.fulfill({ status: 200, contentType: type, headers, body: Buffer.from(body, 'base64') });
      }
      const res = await route.fetch().catch(() => null);
      if (!res) return route.abort();
      const buf = await res.body();
      if (res.ok()) {
        mkdirSync('.scratch/font-cache', { recursive: true });
        writeFileSync(file, JSON.stringify({ type: res.headers()['content-type'] || 'application/octet-stream', body: buf.toString('base64') }));
      }
      return route.fulfill({ response: res, body: buf });
    });
  await ctx.route('https://gateway.halo.gcu.edu/**', async (route) => {
    const r = route.request();
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const b = r.postDataJSON?.() ?? {};
    calls.gateway.push({ op: b.operationName, vars: b.variables, at: Date.now(), auth: r.headers().authorization });
    const h = state.gateway[b.operationName];
    if (state.failGateway || !h) return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ errors: [{ message: 'not in the stand-in' }] }) });
    return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ data: await h(b.variables || {}, state) }) });
  });
  await ctx.route('https://orchestration.halo.gcu.edu/**', async (route) => {
    const r = route.request();
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    calls.rest.push({ method: r.method(), url: r.url(), at: Date.now() });
    const h = (opts.rest || []).find(([re]) => re.test(r.url()));
    if (!h) return route.fulfill({ status: 404, headers: cors, body: '' });
    return h[1](route, r, cors, state);
  });
  return { build, calls, state };
}
export { esc, snake, shell };
