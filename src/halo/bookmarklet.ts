/**
 * The Halo bookmark. Runs on halo.gcu.edu, reads the session the way Halo's own app does,
 * asks the gateway for classes and grades, and hands the result to the dashboard tab.
 * Tokens live in this function's locals for the seconds it runs. Nothing is stored or sent elsewhere.
 * Keep it free of `//` comments and template literals: it is collapsed to one line.
 */
export interface BookmarkletConfig {
  /** Dashboard origin the payload may be sent to, e.g. https://richardsgeorger-collab.github.io */
  dashOrigin: string;
  /** Path opened in the dashboard, e.g. /school-dashboard/#/settings?halo=1 */
  dashPath: string;
}

export const HALO_HOST = 'halo.gcu.edu';
export const GATEWAY = 'https://gateway.halo.gcu.edu/';

const Q_CLASSES =
  'query getCourseClassesForUser($pgNum: Int, $pgSize: Int) { getCourseClassesForUser(pgNum: $pgNum, pgSize: $pgSize) { courseClasses { id classCode slugId startDate endDate name stage modality credits courseCode units { id title sequence startDate endDate assessments { id sequence title description startDate dueDate points type tags requiresLopesWrite isGroupEnabled inPerson } } } } }';
const Q_GRADES =
  'query AllAssessmentGrades($courseClassSlugId: String!, $courseUnitId: String) { assessmentGrades: getAllClassGrades(courseClassSlugId: $courseClassSlugId, courseUnitId: $courseUnitId) { grades { id status dueDate accommodatedDueDate assessment { id } assignmentSubmission { submissionDate } history { status points } } } }';

export function bookmarkletSource(cfg: BookmarkletConfig): string {
  const D = JSON.stringify(cfg.dashOrigin);
  const P = JSON.stringify(cfg.dashOrigin + cfg.dashPath);
  const code = `
(async function(){
var D=${D},P=${P};
if(location.hostname!==${JSON.stringify(HALO_HOST)}){alert('Open halo.gcu.edu first, then click this bookmark.');return;}
var box=document.createElement('div');
box.style.cssText='position:fixed;top:16px;right:16px;z-index:2147483647;background:#171b21;color:#e8ecf0;font:14px/1.4 system-ui,sans-serif;padding:12px 32px 12px 14px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.4);max-width:380px';
var msg=document.createElement('div');msg.textContent='Reading Halo\\u2026';box.appendChild(msg);
var x=document.createElement('button');x.textContent='\\u00d7';x.setAttribute('aria-label','Close');
x.style.cssText='position:absolute;top:4px;right:8px;background:none;border:0;color:#aeb7c2;font-size:18px;cursor:pointer';
x.onclick=function(){box.remove();};box.appendChild(x);document.body.appendChild(box);
var say=function(t){msg.textContent=t;};
var win=null;try{win=window.open(P,'school-dashboard');}catch(e){}
var fallback=function(json){
say('Could not reach the dashboard tab. Copy this, then paste it in the dashboard under Settings, Halo, Paste Halo export.');
var ta=document.createElement('textarea');ta.value=json;ta.readOnly=true;
ta.style.cssText='display:block;width:100%;height:90px;margin-top:8px;font:11px monospace;color:#111;background:#fff';box.appendChild(ta);
var b=document.createElement('button');b.textContent='Copy';
b.style.cssText='margin-top:8px;padding:6px 12px;border-radius:6px;border:0;background:#f5e663;color:#3a3400;font-weight:600;cursor:pointer';
b.onclick=function(){ta.select();var ok=false;try{ok=document.execCommand('copy');}catch(e){}
if(navigator.clipboard){navigator.clipboard.writeText(json).then(function(){b.textContent='Copied';}).catch(function(){b.textContent=ok?'Copied':'Select all and copy';});}
else{b.textContent=ok?'Copied':'Select all and copy';}};
box.appendChild(b);};
try{
var s=await (await fetch('/api/auth/session',{credentials:'include'})).json();
if(!s||!s.authToken||!s.contextToken){throw new Error('No Halo session found. Log in to Halo, then click the bookmark again.');}
var gql=async function(op,q,v){
var r=await fetch(${JSON.stringify(GATEWAY)},{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+s.authToken,'ContextToken':'Bearer '+s.contextToken,'transaction-id':(crypto.randomUUID?crypto.randomUUID():String(Date.now()))},body:JSON.stringify({operationName:op,variables:v,query:q})});
var j=null;try{j=await r.json();}catch(e){}
if(!j||j.errors){throw new Error((j&&j.errors&&j.errors[0]&&j.errors[0].message)||('Halo answered '+r.status));}
return j.data;};
var Q1=${JSON.stringify(Q_CLASSES)};
var Q2=${JSON.stringify(Q_GRADES)};
var cls=((await gql('getCourseClassesForUser',Q1,{pgNum:1,pgSize:50})).getCourseClassesForUser||{}).courseClasses||[];
var classes=[];
for(var i=0;i<cls.length;i++){var c=cls[i];
say('Reading '+(c.courseCode||c.classCode)+' ('+(i+1)+' of '+cls.length+')\\u2026');
var grades=[];try{var g=await gql('AllAssessmentGrades',Q2,{courseClassSlugId:c.slugId,courseUnitId:null});grades=(g.assessmentGrades&&g.assessmentGrades[0]&&g.assessmentGrades[0].grades)||[];}catch(e){}
var byId={};for(var k=0;k<grades.length;k++){var gr=grades[k];if(gr&&gr.assessment&&gr.assessment.id){byId[gr.assessment.id]=gr;}}
var out=[];var units=c.units||[];
for(var u=0;u<units.length;u++){var un=units[u];var as=un.assessments||[];
for(var a=0;a<as.length;a++){var t=as[a];var gg=byId[t.id];
var hist=((gg&&gg.history)||[]).filter(function(h){return h&&h.points!=null;});
var personal=gg&&(gg.accommodatedDueDate||gg.dueDate);
out.push({id:t.id,title:t.title,description:t.description||null,unit:un.title||null,unitSequence:un.sequence==null?null:un.sequence,sequence:t.sequence==null?null:t.sequence,startDate:t.startDate||null,dueDate:personal||t.dueDate||null,classDueDate:t.dueDate||null,points:t.points==null?null:t.points,type:t.type||'ASSIGNMENT',tags:t.tags||[],inPerson:!!t.inPerson,isGroupEnabled:!!t.isGroupEnabled,requiresLopesWrite:!!t.requiresLopesWrite,status:(gg&&gg.status)||null,submittedAt:(gg&&gg.assignmentSubmission&&gg.assignmentSubmission.submissionDate)||null,score:hist.length?hist[hist.length-1].points:null});}}
classes.push({id:c.id,slugId:c.slugId,classCode:c.classCode||'',courseCode:c.courseCode||'',name:c.name||'',startDate:c.startDate||null,endDate:c.endDate||null,stage:c.stage||null,modality:c.modality||null,credits:c.credits==null?null:c.credits,assessments:out});}
var payload={kind:'halo-export',version:1,exportedAt:new Date().toISOString(),source:'bookmarklet',classes:classes};
var n=0;for(var q=0;q<classes.length;q++){n+=classes[q].assessments.length;}
say('Read '+n+' assignments in '+classes.length+' classes. Sending to the dashboard\\u2026');
var got=false;var onMsg=function(e){if(e.origin===D&&e.data&&e.data.kind==='halo-received'){got=true;}};
window.addEventListener('message',onMsg);
var t0=Date.now();
await new Promise(function(res){var iv=setInterval(function(){if(got||Date.now()-t0>20000||!win||win.closed){clearInterval(iv);res();return;}try{win.postMessage(payload,D);}catch(e){}},400);});
window.removeEventListener('message',onMsg);
if(got){say('Sent to the dashboard. Review the changes there.');setTimeout(function(){box.remove();},4000);}
else{fallback(JSON.stringify(payload));}
}catch(e){say('Halo sync failed: '+(e&&e.message?e.message:e));}
})();`;
  return code.replace(/\s*\n\s*/g, ' ').trim();
}

/** The `javascript:` URL to bookmark. */
export function bookmarkletHref(cfg: BookmarkletConfig): string {
  return `javascript:${encodeURIComponent(bookmarkletSource(cfg))}`;
}
