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
/** Instructor names, asked for separately so an unknown field can never break the export. Best guess at the shape; skipped on any error. */
const Q_INSTRUCTORS =
  'query getCourseClassesForUser($pgNum: Int, $pgSize: Int) { getCourseClassesForUser(pgNum: $pgNum, pgSize: $pgSize) { courseClasses { id instructors { user { firstName lastName preferredFirstName } } } } }';
/**
 * Announcements, from Halo's own GetAnnouncementsStudent with its fragments inlined. At GCU the week's real work is
 * often posted here rather than in the assignment list. Asked for in its own call: if the shape ever changes, the
 * catch around it drops announcements for that class and the assignments and grades still come through.
 */
const Q_ANNOUNCEMENTS =
  'query GetAnnouncementsStudent($courseClassId: String!) { announcements(courseClassId: $courseClassId) { forumId courseClassId title startDate endDate posts { id forumId title content publishDate modifiedDate startDate expiryDate postStatus isAcknowledge postFlagAcknowledgements { acknowledge acknowledgedTimestamp userId } createdBy { id user { firstName lastName preferredFirstName } } resources { id name kind type } } } }';
/**
 * Everything below is taken from Halo's own shipped queries, fragments inlined, and each is asked for in its own try:
 * a shape that turns out to be wrong costs that one kind of data for that one class and never the sync.
 */
/** CurrentClass: the grade scale, holidays, the participation policy, and which assessments carry a rubric. */
const Q_CURRENT =
  'query CurrentClass($slugId: String!, $isStudent: Boolean!) { currentClass: getCourseClassBySlugId(slugId: $slugId) { id gradeScale { entries { label minPercent maxPercent } } holidays { title description startDate duration active } participationPolicy { description numDays numPosts } units { id title assessments { id rubric { id name } attachments { id resourceId title } } } } }';
/** The same grade rows the export already reads, asked again for the instructor's words. Separate, so grades survive it. */
const Q_FEEDBACK =
  'query AssessmentFeedback($courseClassSlugId: String!, $courseUnitId: String) { assessmentGrades: getAllClassGrades(courseClassSlugId: $courseClassSlugId, courseUnitId: $courseUnitId) { grades { id gradedDate assessment { id } finalComment { comment commentResources { resource { id name } } } rubricScores { comment criteriaId rubricCellId } userQuizAssessment { userQuizId submissionDate } post { id publishDate wordCount postStatus } } } }';
/** The rubric itself, asked only for assessments CurrentClass said have one. */
const Q_RUBRIC =
  'query AssessmentRubric($assessmentId: String!) { assessmentRubric: getCourseClassAssessmentById(id: $assessmentId) { id rubric { id name criteria { id name description points sequence achievementLevels { cellId description name points sequence } } } } }';
const Q_RESOURCES =
  'query courseClassResources($slugId: String!) { courseClassResources: getCourseClassBySlugId(slugId: $slugId) { id resources { id title description instructorAdded instructorOnly sequence resources { id resource { id kind name type } } } units { id title resources { id title description instructorAdded instructorOnly sequence resources { id resource { id kind name type } } } } } }';
const Q_DQ =
  'query AllDQForCourseClass($courseClassId: String!, $sortBy: String, $pgNum: Int, $pgSize: Int) { allDQForCourseClass: getAllDQForCourseClass(courseClassId: $courseClassId, sortBy: $sortBy, pgNum: $pgNum, pgSize: $pgSize) { forumId title description startDate dueDate totalPosts active } }';
const Q_QUIZ =
  'query GetQuizResult($userQuizId: String!) { userQuiz: userQuiz(id: $userQuizId) { id submitTime quizStatus userQuestions { id sortOrder question { id questionType content } userQuestionOptions { id isSelected response option { id content } } } } userQuizResults: userQuizResult(id: $userQuizId) { finalScore questionsAnswered totalCorrect totalIncorrect } }';
const Q_ALERTS =
  'query GetUserAlerts($userAlerts: UserAlertsInputGQL) { getUserAlerts: getUserAlerts(userAlerts: $userAlerts) { nextToken alerts { id classId isRead timestamp type data { announcementTitle assignmentTitle assessmentId senderName } } } }';
const Q_INBOX =
  'query GetInboxLeftPanel { getInboxLeftPanel: getInboxLeftPanel { courseClassId forums { forumId posts { id content publishDate postStatus createdBy { baseRoleName user { firstName lastName preferredFirstName } } } } } }';
const Q_GRADES =
  'query AllAssessmentGrades($courseClassSlugId: String!, $courseUnitId: String) { assessmentGrades: getAllClassGrades(courseClassSlugId: $courseClassSlugId, courseUnitId: $courseUnitId) { grades { id status dueDate accommodatedDueDate assessment { id } assignmentSubmission { submissionDate } history { status points } } } }';

/** Caps that keep one click bounded: rubrics and quiz attempts are per-assessment calls. */
const MAX_RUBRICS = 12;
const MAX_QUIZZES = 8;
/** Rubric attachments only, never every file: each is a second, non-GraphQL call. */
const MAX_RUBRIC_FILES = 10;

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
var Q3=${JSON.stringify(Q_INSTRUCTORS)};
var Q4=${JSON.stringify(Q_ANNOUNCEMENTS)};
var Q5=${JSON.stringify(Q_CURRENT)};
var Q6=${JSON.stringify(Q_FEEDBACK)};
var Q7=${JSON.stringify(Q_RESOURCES)};
var Q8=${JSON.stringify(Q_DQ)};
var Q9=${JSON.stringify(Q_RUBRIC)};
var Q10=${JSON.stringify(Q_QUIZ)};
var Q11=${JSON.stringify(Q_ALERTS)};
var Q12=${JSON.stringify(Q_INBOX)};
var alerts=[];try{var AL=(await gql('GetUserAlerts',Q11,{userAlerts:{pgSize:50}})).getUserAlerts||{};var al2=AL.alerts||[];for(var ali=0;ali<al2.length;ali++){var AA=al2[ali];if(!AA)continue;var AD=AA.data||{};alerts.push({id:AA.id,classId:AA.classId||null,type:AA.type||null,at:AA.timestamp||null,read:!!AA.isRead,title:AD.announcementTitle||AD.assignmentTitle||null,assessmentId:AD.assessmentId||null,sender:AD.senderName||null});}}catch(e){alerts=[];}
var msgs={};try{var IB=(await gql('GetInboxLeftPanel',Q12,{})).getInboxLeftPanel||[];for(var ib=0;ib<IB.length;ib++){var IC=IB[ib];if(!IC)continue;var mine=[];var ifs=IC.forums||[];for(var ifi=0;ifi<ifs.length;ifi++){var IP=(ifs[ifi]&&ifs[ifi].posts)||[];for(var ipi=0;ipi<IP.length;ipi++){var P2=IP[ipi];if(!P2)continue;var CB=P2.createdBy||{};var U2=CB.user||{};var nm=((U2.preferredFirstName||U2.firstName||'')+' '+(U2.lastName||'')).trim();mine.push({id:P2.id,forumId:ifs[ifi].forumId||null,content:P2.content||'',publishedAt:P2.publishDate||null,author:nm||null,fromInstructor:String(CB.baseRoleName||'').toUpperCase().indexOf('STUDENT')<0});}}
mine.sort(function(a,b){return String(b.publishedAt||'').localeCompare(String(a.publishedAt||''));});msgs[IC.courseClassId]=mine;}}catch(e){msgs={};}
var cls=((await gql('getCourseClassesForUser',Q1,{pgNum:1,pgSize:50})).getCourseClassesForUser||{}).courseClasses||[];
var names={};try{var ic=((await gql('getCourseClassesForUser',Q3,{pgNum:1,pgSize:50})).getCourseClassesForUser||{}).courseClasses||[];for(var ii=0;ii<ic.length;ii++){names[ic[ii].id]=ic[ii].instructors||[];}}catch(e){}
var classes=[];
for(var i=0;i<cls.length;i++){var c=cls[i];
say('Reading '+(c.courseCode||c.classCode)+' ('+(i+1)+' of '+cls.length+')\\u2026');
var grades=[];try{var g=await gql('AllAssessmentGrades',Q2,{courseClassSlugId:c.slugId,courseUnitId:null});grades=(g.assessmentGrades&&g.assessmentGrades[0]&&g.assessmentGrades[0].grades)||[];}catch(e){}
var cur=null;try{cur=(await gql('CurrentClass',Q5,{slugId:c.slugId,isStudent:true})).currentClass||null;}catch(e){}
var fb={};try{var fg=await gql('AssessmentFeedback',Q6,{courseClassSlugId:c.slugId,courseUnitId:null});var fr=(fg.assessmentGrades&&fg.assessmentGrades[0]&&fg.assessmentGrades[0].grades)||[];for(var fi2=0;fi2<fr.length;fi2++){var fgr=fr[fi2];if(fgr&&fgr.assessment&&fgr.assessment.id){fb[fgr.assessment.id]=fgr;}}}catch(e){}
var res=[];try{var rc=(await gql('courseClassResources',Q7,{slugId:c.slugId})).courseClassResources||{};
var pushRes=function(list,unitTitle){for(var qi=0;qi<(list||[]).length;qi++){var R=list[qi];if(!R||R.instructorOnly)continue;var files=[];var inner=R.resources||[];for(var ii=0;ii<inner.length;ii++){var rr2=inner[ii]&&inner[ii].resource;if(rr2){files.push({id:rr2.id,name:rr2.name||'',kind:rr2.kind||null,type:rr2.type||null});}}
res.push({id:R.id,title:R.title||'',description:R.description||null,instructorAdded:!!R.instructorAdded,unit:unitTitle,files:files});}};
pushRes(rc.resources,null);var ru=rc.units||[];for(var ui=0;ui<ru.length;ui++){pushRes(ru[ui].resources,ru[ui].title||null);}}catch(e){res=[];}
var dqs=[];try{var dl=(await gql('AllDQForCourseClass',Q8,{courseClassId:c.id,sortBy:null,pgNum:1,pgSize:50})).allDQForCourseClass||[];for(var di=0;di<dl.length;di++){var D=dl[di];if(!D)continue;dqs.push({forumId:D.forumId,title:D.title||'',description:D.description||null,startDate:D.startDate||null,dueDate:D.dueDate||null,totalPosts:D.totalPosts==null?null:D.totalPosts});}}catch(e){dqs=[];}
var anns=[];try{var af=(await gql('GetAnnouncementsStudent',Q4,{courseClassId:c.id})).announcements||[];
for(var fi=0;fi<af.length;fi++){var fm=af[fi];var ps=(fm&&fm.posts)||[];
for(var pi=0;pi<ps.length;pi++){var po=ps[pi];if(!po)continue;if(po.postStatus&&String(po.postStatus).toUpperCase().indexOf('DELET')>=0)continue;
var au=po.createdBy&&po.createdBy.user;var who=au?((au.preferredFirstName||au.firstName||'')+' '+(au.lastName||'')).trim():'';
var acks=po.postFlagAcknowledgements||[];var didAck=false;for(var ai=0;ai<acks.length;ai++){if(acks[ai]&&acks[ai].acknowledge){didAck=true;}}
var res=[];var rr=po.resources||[];for(var ri=0;ri<rr.length;ri++){if(rr[ri]){res.push({id:rr[ri].id,name:rr[ri].name||'',kind:rr[ri].kind||null,type:rr[ri].type||null});}}
anns.push({id:po.id,forumId:po.forumId||fm.forumId||null,title:po.title||fm.title||'',content:po.content||'',publishedAt:po.publishDate||po.startDate||null,modifiedAt:po.modifiedDate||null,author:who||null,mustAcknowledge:!!po.isAcknowledge,acknowledged:didAck,resources:res});}}
anns.sort(function(a,b){return String(b.publishedAt||'').localeCompare(String(a.publishedAt||''));});}catch(e){anns=[];}
var byId={};for(var k=0;k<grades.length;k++){var gr=grades[k];if(gr&&gr.assessment&&gr.assessment.id){byId[gr.assessment.id]=gr;}}
var out=[];var units=c.units||[];
for(var u=0;u<units.length;u++){var un=units[u];var as=un.assessments||[];
for(var a=0;a<as.length;a++){var t=as[a];var gg=byId[t.id];
var hist=((gg&&gg.history)||[]).filter(function(h){return h&&h.points!=null;});
var personal=gg&&(gg.accommodatedDueDate||gg.dueDate);
out.push({id:t.id,title:t.title,description:t.description||null,unit:un.title||null,unitSequence:un.sequence==null?null:un.sequence,sequence:t.sequence==null?null:t.sequence,startDate:t.startDate||null,dueDate:personal||t.dueDate||null,classDueDate:t.dueDate||null,points:t.points==null?null:t.points,type:t.type||'ASSIGNMENT',tags:t.tags||[],inPerson:!!t.inPerson,isGroupEnabled:!!t.isGroupEnabled,requiresLopesWrite:!!t.requiresLopesWrite,status:(gg&&gg.status)||null,submittedAt:(gg&&gg.assignmentSubmission&&gg.assignmentSubmission.submissionDate)||null,score:hist.length?hist[hist.length-1].points:null,
rubric:rubrics[rubricOf[t.id]]||null,
attachments:attachOf[t.id]||[],
quiz:quizzes[t.id]||null,
feedback:(function(F){if(!F)return null;var fc=F.finalComment||{};var cr=F.rubricScores||[];var cs=[];for(var xi=0;xi<cr.length;xi++){if(cr[xi]){cs.push({criteriaId:cr[xi].criteriaId,cellId:cr[xi].rubricCellId||null,comment:cr[xi].comment||null});}}
var ff=[];var fres=fc.commentResources||[];for(var yi=0;yi<fres.length;yi++){var FR2=fres[yi]&&fres[yi].resource;if(FR2){ff.push({id:FR2.id,name:FR2.name||''});}}
var myPost=F.post&&F.post.publishDate?{publishedAt:F.post.publishDate,words:F.post.wordCount==null?null:F.post.wordCount}:null;
if(!fc.comment&&cs.length===0&&ff.length===0&&!myPost)return null;
return{comment:fc.comment||null,gradedAt:F.gradedDate||null,criteria:cs,files:ff,post:myPost};})(fb[t.id])});}}
var rubricOf={},attachOf={};if(cur&&cur.units){for(var cu=0;cu<cur.units.length;cu++){var cas=(cur.units[cu]&&cur.units[cu].assessments)||[];for(var ca=0;ca<cas.length;ca++){var A2=cas[ca];if(!A2)continue;if(A2.rubric&&A2.rubric.id){rubricOf[A2.id]=A2.rubric.id;}if(A2.attachments&&A2.attachments.length){attachOf[A2.id]=A2.attachments.map(function(x){return{id:x.id,resourceId:x.resourceId||null,title:x.title||''};});}}}}
var rubricIds=[];for(var rk in rubricOf){if(Object.prototype.hasOwnProperty.call(rubricOf,rk)){rubricIds.push(rk);}}
rubricIds=rubricIds.slice(0,${MAX_RUBRICS});
var rubrics={};for(var rq=0;rq<rubricIds.length;rq++){try{say('Reading '+(c.courseCode||c.classCode)+' rubrics ('+(rq+1)+' of '+rubricIds.length+')\u2026');var RB=(await gql('AssessmentRubric',Q9,{assessmentId:rubricIds[rq]})).assessmentRubric;var RR=RB&&RB.rubric;if(RR){var crit=[];var cl=RR.criteria||[];for(var ci=0;ci<cl.length;ci++){var C2=cl[ci];if(!C2)continue;var lv=[];var al=C2.achievementLevels||[];for(var li=0;li<al.length;li++){var L=al[li];if(L){lv.push({cellId:L.cellId,name:L.name||null,description:L.description||null,points:L.points==null?null:L.points});}}
crit.push({id:C2.id,name:C2.name||'',description:C2.description||null,points:C2.points==null?null:C2.points,levels:lv});}
rubrics[rubricIds[rq]]={id:RR.id,name:RR.name||null,criteria:crit};}}catch(e){}}
var quizzes={};var quizIds=[];for(var qk in fb){if(Object.prototype.hasOwnProperty.call(fb,qk)&&fb[qk]&&fb[qk].userQuizAssessment&&fb[qk].userQuizAssessment.userQuizId){quizIds.push([qk,fb[qk].userQuizAssessment.userQuizId]);}}
quizIds=quizIds.slice(0,${MAX_QUIZZES});
for(var qz=0;qz<quizIds.length;qz++){try{var QD=await gql('GetQuizResult',Q10,{userQuizId:quizIds[qz][1]});var UQ=QD.userQuiz||{};var QR=QD.userQuizResults||{};var qs=[];var uqs=UQ.userQuestions||[];for(var qi2=0;qi2<uqs.length;qi2++){var UQu=uqs[qi2];if(!UQu||!UQu.question)continue;var chosen=[];var opts=UQu.userQuestionOptions||[];for(var oi=0;oi<opts.length;oi++){if(opts[oi]&&opts[oi].isSelected){chosen.push((opts[oi].option&&opts[oi].option.content)||opts[oi].response||'');}else if(opts[oi]&&opts[oi].response){chosen.push(opts[oi].response);}}
qs.push({id:UQu.question.id,type:UQu.question.questionType||null,content:UQu.question.content||'',chosen:chosen});}
quizzes[quizIds[qz][0]]={userQuizId:quizIds[qz][1],finalScore:QR.finalScore==null?null:QR.finalScore,answered:QR.questionsAnswered==null?null:QR.questionsAnswered,correct:QR.totalCorrect==null?null:QR.totalCorrect,incorrect:QR.totalIncorrect==null?null:QR.totalIncorrect,submittedAt:UQ.submitTime||null,questions:qs};}catch(e){}}
var who=(names[c.id]||[]).map(function(x){var u=x&&x.user;return u?((u.preferredFirstName||u.firstName||'')+' '+(u.lastName||'')).trim():'';}).filter(Boolean);
classes.push({id:c.id,slugId:c.slugId,classCode:c.classCode||'',courseCode:c.courseCode||'',name:c.name||'',instructors:who,startDate:c.startDate||null,endDate:c.endDate||null,stage:c.stage||null,modality:c.modality||null,credits:c.credits==null?null:c.credits,assessments:out,announcements:anns,resources:res,discussions:dqs,gradeScale:(cur&&cur.gradeScale&&cur.gradeScale.entries)?cur.gradeScale.entries.map(function(E){return{label:E.label||'',minPercent:E.minPercent==null?null:E.minPercent,maxPercent:E.maxPercent==null?null:E.maxPercent};}):[],holidays:(cur&&cur.holidays)?cur.holidays.filter(function(H){return H&&H.active!==false;}).map(function(H){return{title:H.title||'',description:H.description||null,startDate:H.startDate||null,duration:H.duration==null?null:H.duration};}):[],participation:(cur&&cur.participationPolicy)?{description:cur.participationPolicy.description||null,days:cur.participationPolicy.numDays==null?null:cur.participationPolicy.numDays,posts:cur.participationPolicy.numPosts==null?null:cur.participationPolicy.numPosts}:null,messages:msgs[c.id]||[]});}
var orch='';try{var ND=JSON.parse(document.getElementById('__NEXT_DATA__').textContent);orch=(ND&&ND.runtimeConfig&&ND.runtimeConfig.orchestrationApiEndpoint)||'';}catch(e){orch='';}
if(orch){var want=[];for(var ci2=0;ci2<classes.length;ci2++){var AS=classes[ci2].assessments||[];for(var ai2=0;ai2<AS.length;ai2++){if(AS[ai2].rubric&&AS[ai2].attachments&&AS[ai2].attachments.length){for(var xa=0;xa<AS[ai2].attachments.length;xa++){if(AS[ai2].attachments[xa].resourceId){want.push(AS[ai2].attachments[xa]);}}}}}
want=want.slice(0,${MAX_RUBRIC_FILES});
for(var wi=0;wi<want.length;wi++){try{say('Getting rubric files ('+(wi+1)+' of '+want.length+')\u2026');var DR=await fetch(orch+'downloadUrl/'+want[wi].resourceId,{method:'GET',headers:{'Authorization':'Bearer '+s.authToken,'ContextToken':'Bearer '+s.contextToken}});var DJ=await DR.json();var du=(DJ&&(DJ.downloadUrl||(DJ.result&&DJ.result.downloadUrl)))||'';if(du){want[wi].downloadUrl=du;}}catch(e){}}}
var payload={kind:'halo-export',version:1,exportedAt:new Date().toISOString(),source:'bookmarklet',classes:classes,alerts:alerts};
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
