/**
 * The Halo bookmark. Runs on halo.gcu.edu, reads the session the way Halo's own app does,
 * asks the gateway for classes and grades, and hands the result to the dashboard tab.
 * Tokens live in this function's locals for the seconds it runs. Nothing is stored or sent elsewhere.
 * Keep it free of `//` comments and template literals: it is collapsed to one line.
 */
export interface BookmarkletConfig {
  /** Dashboard origin the payload may be sent to, e.g. https://richardsgeorger-collab.github.io */
  dashOrigin: string;
  /** Path opened in the dashboard, e.g. /school-dashboard/#/now?halo=1 */
  dashPath: string;
  /**
   * How the export leaves Halo. 'open' (the bookmark): open the dashboard tab and post to it. 'message' (the
   * extension): post to Halo's own window, where the extension's content script picks it up and carries it over.
   */
  deliver?: 'open' | 'message';
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
/** Announcements are a forum, not a root field. These two are rebuilt from Halo's own parsed operations. */
const Q_FORUM_NOTIFS =
  'query GetForumNotifications($classId: String!, $filters: FilterInputGQL) { classes: getForumNotifications(classId: $classId, filter: $filters) { forumTypes { ANNOUNCEMENTS { classes { classId count forums { count forumId posts } } } } } }';
const Q_FORUM_POSTS =
  'query getDiscussionForumPosts($forumId: String, $postId: String, $depthStart: Int, $depthEnd: Int) { Posts: posts(forumId: $forumId, postId: $postId, depthStart: $depthStart, depthEnd: $depthEnd) { id forumId content postStatus parentPostId hasChildren pinOrder publishDate modifiedDate isAcknowledge flagType countOfAcknowledgements createdBy { id baseRoleName user { firstName lastName preferredFirstName } } resources { id kind name type } } }';
/**
 * Everything below is taken from Halo's own shipped queries, fragments inlined, and each is asked for in its own try:
 * a shape that turns out to be wrong costs that one kind of data for that one class and never the sync.
 */
/** CurrentClass: the grade scale, holidays, the participation policy, and which assessments carry a rubric. */
const Q_CURRENT =
  'query ClassFacts($slugId: String!) { currentClass: getCourseClassBySlugId(slugId: $slugId) { id gradeScale { entries { label minPercent maxPercent } } holidays { title description startDate duration active } participationPolicy { description numDays numPosts } units { id title assessments { id rubric { id name } attachments { id resourceId title } } } } }';
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
  'query GetUserAlerts($userAlerts: UserAlertsInputGQL) { getUserAlerts: getUserAlerts(userAlerts: $userAlerts) { nextToken alerts { id classId isRead timestamp type data { announcementTitle assignmentTitle assessmentId senderName forumId forumType postId } } } }';
const Q_INBOX =
  'query GetInboxLeftPanel { getInboxLeftPanel: getInboxLeftPanel { courseClassId forums { forumId posts { id content publishDate postStatus createdBy { baseRoleName user { firstName lastName preferredFirstName } } } } } }';
const Q_GRADES =
  'query AllAssessmentGrades($courseClassSlugId: String!, $courseUnitId: String) { assessmentGrades: getAllClassGrades(courseClassSlugId: $courseClassSlugId, courseUnitId: $courseUnitId) { grades { id status dueDate accommodatedDueDate assessment { id } assignmentSubmission { submissionDate } history { status points } } } }';

/**
 * The build this bookmarklet came from. A bookmarklet is a URL frozen in the bookmarks bar the moment it is saved;
 * deploying new code does not update it. Stamping the payload is the only way the app can tell the user their
 * bookmark is old rather than quietly showing them three queries' worth of data and calling it eleven.
 */
export const BOOKMARKLET_BUILD = '2026-09-24a';

/**
 * Asked only when something already failed. If the gateway allows introspection this settles every remaining
 * question at once: whether a field exists, and what arguments it really takes. If it does not, that is recorded
 * too, and we are no worse off. Nothing here changes what is imported.
 */
const Q_SCHEMA =
  'query HaloSchemaProbe { __schema { queryType { fields { name args { name type { kind name ofType { kind name ofType { kind name } } } } } } } }';
const Q_TYPE =
  'query HaloTypeProbe($name: String!) { __type(name: $name) { name kind fields { name type { kind name ofType { kind name } } } inputFields { name type { kind name ofType { kind name } } } } }';

/** Caps that keep one click bounded: rubrics and quiz attempts are per-assessment calls. */
const MAX_RUBRICS = 12;
const MAX_QUIZZES = 8;
/** Rubric attachments only, never every file: each is a second, non-GraphQL call. */
const MAX_RUBRIC_FILES = 10;

/**
 * Every read is guarded twice. Each query has its own try so a bad shape costs that one kind of data, and the whole
 * per-class body has one more so a bad class costs that class and never the other five. What failed is recorded in
 * `problems` and travels with the payload: an empty list because nothing was posted and an empty list because the
 * call broke must never look the same in the app.
 */
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
var problems=[];
var prob=function(where,kind,e){var m=(e&&e.message)?String(e.message):String(e);
var list=(e&&e.errors&&e.errors.length)?e.errors.map(function(x){return String(x).slice(0,400);}):[m.slice(0,400)];
problems.push({klass:where||null,kind:kind,message:m.slice(0,400),op:(e&&e.op)||null,status:(e&&e.status)==null?null:e.status,errors:list,sent:(e&&e.vars)?JSON.stringify(e.vars).slice(0,200):null,missingField:(e&&e.missingField)||null,got:(e&&e.shape)||null});};
var MODE=${JSON.stringify(cfg.deliver ?? 'open')};
var win=null,openErr=null;if(MODE==='open'){try{win=window.open(P,'school-dashboard');}catch(e){openErr=e;}
if(!win){openErr=openErr||new Error('blocked');}}
var fallback=function(json,why){
say(why+' Copy this, then paste it in the dashboard: Sync, Having trouble, Paste the export.');
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
var fail=function(m,list){var E=new Error(m);E.op=op;E.status=r.status;E.vars=v;E.errors=list||[m];return E;};
if(!j||j.errors){var ms=[];var el=(j&&j.errors)||[];for(var ei=0;ei<el.length;ei++){if(el[ei]&&el[ei].message){ms.push(String(el[ei].message));}}
throw fail(ms[0]||('Halo answered '+r.status),ms);}
if(!j.data){throw fail('Halo returned no data for '+op);}
return j.data;};
var noField=function(op,field){var E=new Error('Halo returned no '+field+' field');E.op=op;E.missingField=field;return E;};
var Q1=${JSON.stringify(Q_CLASSES)};
var Q2=${JSON.stringify(Q_GRADES)};
var Q3=${JSON.stringify(Q_INSTRUCTORS)};
var Q4=${JSON.stringify(Q_ANNOUNCEMENTS)};
var Q4b=${JSON.stringify(Q_FORUM_NOTIFS)};
var Q4c=${JSON.stringify(Q_FORUM_POSTS)};
var Q5=${JSON.stringify(Q_CURRENT)};
var Q6=${JSON.stringify(Q_FEEDBACK)};
var Q7=${JSON.stringify(Q_RESOURCES)};
var Q8=${JSON.stringify(Q_DQ)};
var Q9=${JSON.stringify(Q_RUBRIC)};
var Q10=${JSON.stringify(Q_QUIZ)};
var Q11=${JSON.stringify(Q_ALERTS)};
var Q12=${JSON.stringify(Q_INBOX)};
var QS=${JSON.stringify(Q_SCHEMA)};
var QT=${JSON.stringify(Q_TYPE)};
var alerts;
try{var AD0=await gql('GetUserAlerts',Q11,{userAlerts:{pageSize:'200'}});if(!AD0||AD0.getUserAlerts===undefined){throw noField('GetUserAlerts','getUserAlerts');}var AL=AD0.getUserAlerts||{};var al2=AL.alerts||[];var aout=[];
for(var ali=0;ali<al2.length;ali++){var AA=al2[ali];if(!AA)continue;var AD=AA.data||{};
aout.push({id:AA.id,classId:AA.classId||null,type:AA.type||null,at:AA.timestamp||null,read:!!AA.isRead,title:AD.announcementTitle||AD.assignmentTitle||null,assessmentId:AD.assessmentId||null,sender:AD.senderName||null,forumId:AD.forumId||null,forumType:AD.forumType||null,announcementTitle:AD.announcementTitle||null,postId:AD.postId||null});}
alerts=aout;}catch(e){alerts=undefined;prob(null,'alerts',e);}
var alertForums={};
for(var afi=0;alerts&&afi<alerts.length;afi++){var AF=alerts[afi];
if(!AF||!AF.classId||!AF.forumId)continue;
if(!AF.announcementTitle&&String(AF.forumType||'').toUpperCase().indexOf('ANNOUNCE')<0)continue;
if(!alertForums[AF.classId]){alertForums[AF.classId]=[];}
if(alertForums[AF.classId].indexOf(AF.forumId)<0){alertForums[AF.classId].push(AF.forumId);}}
var msgs={};
try{var ID0=await gql('GetInboxLeftPanel',Q12,{});if(!ID0||ID0.getInboxLeftPanel===undefined){throw noField('GetInboxLeftPanel','getInboxLeftPanel');}var IB=ID0.getInboxLeftPanel||[];
for(var ib=0;ib<IB.length;ib++){var IC=IB[ib];if(!IC||!IC.courseClassId)continue;var mine=[];var ifs=IC.forums||[];
for(var ifi=0;ifi<ifs.length;ifi++){var IF=ifs[ifi];if(!IF)continue;var IP=IF.posts||[];
for(var ipi=0;ipi<IP.length;ipi++){var P2=IP[ipi];if(!P2)continue;var CB=P2.createdBy||{};var U2=CB.user||{};
var nm=((U2.preferredFirstName||U2.firstName||'')+' '+(U2.lastName||'')).trim();
mine.push({id:P2.id,forumId:IF.forumId||null,content:P2.content||'',publishedAt:P2.publishDate||null,author:nm||null,fromInstructor:String(CB.baseRoleName||'').toUpperCase().indexOf('STUDENT')<0});}}
mine.sort(function(a,b){return String(b.publishedAt||'').localeCompare(String(a.publishedAt||''));});msgs[IC.courseClassId]=mine;}}catch(e){msgs={};prob(null,'inbox',e);}
var CD=await gql('getCourseClassesForUser',Q1,{pgNum:1,pgSize:50});
var cls=((CD&&CD.getCourseClassesForUser)||{}).courseClasses||[];
if(!cls.length){throw new Error('Halo returned no classes. Open a class in Halo, then click the bookmark again.');}
var names={};
try{var ND0=await gql('getCourseClassesForUser',Q3,{pgNum:1,pgSize:50});if(!ND0||!ND0.getCourseClassesForUser){throw noField('getCourseClassesForUser','getCourseClassesForUser');}var ic=ND0.getCourseClassesForUser.courseClasses||[];
for(var ii=0;ii<ic.length;ii++){if(ic[ii]&&ic[ii].id){names[ic[ii].id]=ic[ii].instructors||[];}}}catch(e){names={};prob(null,'instructor names',e);}
var classes=[];
for(var i=0;i<cls.length;i++){var c=cls[i];
if(!c||!c.id){continue;}
var code=c.courseCode||c.classCode||'a class';
say('Reading '+code+' ('+(i+1)+' of '+cls.length+')\\u2026');
var grades=[],cur=null,fb={},res,dqs,anns,rubricOf={},attachOf={},rubrics={},quizzes={},out=[],okRub=false,okFb=false,okQz=false;
try{
try{var g=await gql('AllAssessmentGrades',Q2,{courseClassSlugId:c.slugId,courseUnitId:null});if(!g||g.assessmentGrades===undefined){throw noField('AllAssessmentGrades','assessmentGrades');}
grades=((g.assessmentGrades&&g.assessmentGrades[0]&&g.assessmentGrades[0].grades)||[]);}catch(e){grades=[];prob(code,'grades',e);}
try{var CC=await gql('ClassFacts',Q5,{slugId:c.slugId});if(!CC||CC.currentClass===undefined){throw noField('ClassFacts','currentClass');}cur=CC.currentClass||null;}catch(e){cur=null;prob(code,'class facts',e);}
try{var fg=await gql('AssessmentFeedback',Q6,{courseClassSlugId:c.slugId,courseUnitId:null});if(!fg||fg.assessmentGrades===undefined){throw noField('AssessmentFeedback','assessmentGrades');}
var fr=((fg.assessmentGrades&&fg.assessmentGrades[0]&&fg.assessmentGrades[0].grades)||[]);
for(var fi2=0;fi2<fr.length;fi2++){var fgr=fr[fi2];if(fgr&&fgr.assessment&&fgr.assessment.id){fb[fgr.assessment.id]=fgr;}}
okFb=true;}catch(e){fb={};okFb=false;prob(code,'instructor feedback',e);}
try{var RD=await gql('courseClassResources',Q7,{slugId:c.slugId});if(!RD||RD.courseClassResources===undefined){throw noField('courseClassResources','courseClassResources');}var rc=RD.courseClassResources||{};var rout=[];
var pushRes=function(list,unitTitle){var L2=list||[];for(var qi=0;qi<L2.length;qi++){var R=L2[qi];if(!R||R.instructorOnly)continue;
var files=[];var inner=R.resources||[];for(var i3=0;i3<inner.length;i3++){var rr2=inner[i3]&&inner[i3].resource;if(rr2){files.push({id:rr2.id,name:rr2.name||'',kind:rr2.kind||null,type:rr2.type||null});}}
rout.push({id:R.id,title:R.title||'',description:R.description||null,instructorAdded:!!R.instructorAdded,unit:unitTitle,files:files});}};
pushRes(rc.resources,null);var ru=rc.units||[];
for(var ui=0;ui<ru.length;ui++){if(ru[ui]){pushRes(ru[ui].resources,ru[ui].title||null);}}
res=rout;}catch(e){res=undefined;prob(code,'class resources',e);}
try{var DD=await gql('AllDQForCourseClass',Q8,{courseClassId:c.id,sortBy:null,pgNum:1,pgSize:50});if(!DD||DD.allDQForCourseClass===undefined){throw noField('AllDQForCourseClass','allDQForCourseClass');}var dl=DD.allDQForCourseClass||[];var dout=[];
for(var di=0;di<dl.length;di++){var DQ=dl[di];if(!DQ)continue;
dout.push({forumId:DQ.forumId,title:DQ.title||'',description:DQ.description||null,startDate:DQ.startDate||null,dueDate:DQ.dueDate||null,totalPosts:DQ.totalPosts==null?null:DQ.totalPosts});}
dqs=dout;}catch(e){dqs=undefined;prob(code,'discussions',e);}
var af=null;
try{var FN=await gql('GetForumNotifications',Q4b,{classId:c.id,filters:null});
var fids=[];
var reap=function(node){if(!node)return;
var an=((node.forumTypes||{}).ANNOUNCEMENTS)||null;if(!an)return;
var acs=an.classes||(Array.isArray(an)?an:[]);
for(var z1=0;z1<acs.length;z1++){var zf=(acs[z1]&&acs[z1].forums)||[];
for(var z2=0;z2<zf.length;z2++){if(zf[z2]&&zf[z2].forumId&&fids.indexOf(zf[z2].forumId)<0){fids.push(zf[z2].forumId);}}}};
var top=(FN||{}).classes;
if(Array.isArray(top)){for(var z0=0;z0<top.length;z0++){reap(top[z0]);}}else{reap(top);}
if(!fids.length&&alertForums[c.id]){for(var z5=0;z5<alertForums[c.id].length;z5++){if(fids.indexOf(alertForums[c.id][z5])<0){fids.push(alertForums[c.id][z5]);}}}
if(!fids.length){var E2=new Error('getForumNotifications answered but named no announcement forum');E2.op='GetForumNotifications';E2.shape=JSON.stringify(FN||null).slice(0,600);throw E2;}
var pooled=[];
for(var z3=0;z3<fids.length&&z3<3;z3++){var PP=await gql('getDiscussionForumPosts',Q4c,{forumId:fids[z3],postId:null,depthStart:0,depthEnd:1});
if(!PP||PP.Posts===undefined){throw noField('getDiscussionForumPosts','Posts');}var pl=PP.Posts||[];for(var z4=0;z4<pl.length;z4++){if(pl[z4]){pooled.push(pl[z4]);}}}
af=[{forumId:fids[0],posts:pooled}];}catch(e){af=null;prob(code,'announcements',e);}
try{if(af===null){var AN=await gql('GetAnnouncementsStudent',Q4,{courseClassId:c.id});if(!AN||AN.announcements===undefined){throw noField('GetAnnouncementsStudent','announcements');}af=AN.announcements||[];}var nout=[];
for(var fi=0;fi<af.length;fi++){var fm=af[fi];if(!fm)continue;var ps=fm.posts||[];
for(var pi=0;pi<ps.length;pi++){var po=ps[pi];if(!po)continue;
if(po.postStatus&&String(po.postStatus).toUpperCase().indexOf('DELET')>=0)continue;
var au=po.createdBy&&po.createdBy.user;var who2=au?((au.preferredFirstName||au.firstName||'')+' '+(au.lastName||'')).trim():'';
var acks=po.postFlagAcknowledgements||[];var didAck=po.countOfAcknowledgements>0;
for(var ai=0;ai<acks.length;ai++){if(acks[ai]&&acks[ai].acknowledge){didAck=true;}}
var pres=[];var rr=po.resources||[];
for(var ri=0;ri<rr.length;ri++){if(rr[ri]){pres.push({id:rr[ri].id,name:rr[ri].name||'',kind:rr[ri].kind||null,type:rr[ri].type||null});}}
var body=String(po.content||'');var plain=body.replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/\\s+/g,' ').trim();
nout.push({id:po.id,forumId:po.forumId||fm.forumId||null,title:po.title||fm.title||plain.slice(0,80),content:po.content||'',publishedAt:po.publishDate||po.startDate||null,modifiedAt:po.modifiedDate||null,author:who2||null,mustAcknowledge:!!po.isAcknowledge,acknowledged:didAck,resources:pres});}}
nout.sort(function(a,b){return String(b.publishedAt||'').localeCompare(String(a.publishedAt||''));});
anns=nout;}catch(e){anns=undefined;prob(code,'announcements',e);}
try{if(cur&&cur.units){var cus=cur.units;
for(var cu=0;cu<cus.length;cu++){var cas=(cus[cu]&&cus[cu].assessments)||[];
for(var ca=0;ca<cas.length;ca++){var A2=cas[ca];if(!A2||!A2.id)continue;
if(A2.rubric&&A2.rubric.id){rubricOf[A2.id]=A2.rubric.id;}
var ats=A2.attachments||[];var aa=[];
for(var xi2=0;xi2<ats.length;xi2++){if(ats[xi2]){aa.push({id:ats[xi2].id,resourceId:ats[xi2].resourceId||null,title:ats[xi2].title||''});}}
if(aa.length){attachOf[A2.id]=aa;}}}
okRub=true;}}catch(e){rubricOf={};attachOf={};okRub=false;prob(code,'rubric list',e);}
var rubricIds=[];for(var rk in rubricOf){if(Object.prototype.hasOwnProperty.call(rubricOf,rk)){rubricIds.push(rk);}}
rubricIds=rubricIds.slice(0,${MAX_RUBRICS});
for(var rq=0;rq<rubricIds.length;rq++){try{say('Reading '+code+' rubrics ('+(rq+1)+' of '+rubricIds.length+')\\u2026');
var RB0=await gql('AssessmentRubric',Q9,{assessmentId:rubricIds[rq]});if(!RB0||RB0.assessmentRubric===undefined){throw noField('AssessmentRubric','assessmentRubric');}var RB=RB0.assessmentRubric;var RR=RB&&RB.rubric;
if(RR){var crit=[];var cl=RR.criteria||[];
for(var ci=0;ci<cl.length;ci++){var C2=cl[ci];if(!C2)continue;var lv=[];var al=C2.achievementLevels||[];
for(var li=0;li<al.length;li++){var L=al[li];if(L){lv.push({cellId:L.cellId,name:L.name||null,description:L.description||null,points:L.points==null?null:L.points});}}
crit.push({id:C2.id,name:C2.name||'',description:C2.description||null,points:C2.points==null?null:C2.points,levels:lv});}
rubrics[rubricIds[rq]]={id:RR.id,name:RR.name||null,criteria:crit};}}catch(e){prob(code,'rubric',e);}}
var quizIds=[];
for(var qk in fb){if(Object.prototype.hasOwnProperty.call(fb,qk)&&fb[qk]&&fb[qk].userQuizAssessment&&fb[qk].userQuizAssessment.userQuizId){quizIds.push([qk,fb[qk].userQuizAssessment.userQuizId]);}}
quizIds=quizIds.slice(0,${MAX_QUIZZES});
okQz=okFb;
for(var qz=0;qz<quizIds.length;qz++){try{var QD=await gql('GetQuizResult',Q10,{userQuizId:quizIds[qz][1]});if(!QD||QD.userQuiz===undefined){throw noField('GetQuizResult','userQuiz');}
var UQ=QD.userQuiz||{};var QR=QD.userQuizResults||{};var qs=[];var uqs=UQ.userQuestions||[];
for(var qi2=0;qi2<uqs.length;qi2++){var UQu=uqs[qi2];if(!UQu||!UQu.question)continue;var chosen=[];var opts=UQu.userQuestionOptions||[];
for(var oi=0;oi<opts.length;oi++){var OP=opts[oi];if(!OP)continue;
if(OP.isSelected){chosen.push((OP.option&&OP.option.content)||OP.response||'');}else if(OP.response){chosen.push(OP.response);}}
qs.push({id:UQu.question.id,type:UQu.question.questionType||null,content:UQu.question.content||'',chosen:chosen});}
quizzes[quizIds[qz][0]]={userQuizId:quizIds[qz][1],finalScore:QR.finalScore==null?null:QR.finalScore,answered:QR.questionsAnswered==null?null:QR.questionsAnswered,correct:QR.totalCorrect==null?null:QR.totalCorrect,incorrect:QR.totalIncorrect==null?null:QR.totalIncorrect,submittedAt:UQ.submitTime||null,questions:qs};}catch(e){prob(code,'quiz result',e);}}
var byId={};
for(var k=0;k<grades.length;k++){var gr=grades[k];if(gr&&gr.assessment&&gr.assessment.id){byId[gr.assessment.id]=gr;}}
var feedbackOf=function(F){if(!F)return null;var fc=F.finalComment||{};var cr=F.rubricScores||[];var cs=[];
for(var xi=0;xi<cr.length;xi++){if(cr[xi]){cs.push({criteriaId:cr[xi].criteriaId,cellId:cr[xi].rubricCellId||null,comment:cr[xi].comment||null});}}
var ff=[];var fres=fc.commentResources||[];
for(var yi=0;yi<fres.length;yi++){var FR2=fres[yi]&&fres[yi].resource;if(FR2){ff.push({id:FR2.id,name:FR2.name||''});}}
var myPost=(F.post&&F.post.publishDate)?{publishedAt:F.post.publishDate,words:F.post.wordCount==null?null:F.post.wordCount}:null;
if(!fc.comment&&cs.length===0&&ff.length===0&&!myPost)return null;
return{comment:fc.comment||null,gradedAt:F.gradedDate||null,criteria:cs,files:ff,post:myPost};};
var units=c.units||[];
for(var u=0;u<units.length;u++){var un=units[u];if(!un)continue;var as=un.assessments||[];
for(var a=0;a<as.length;a++){var t=as[a];if(!t||!t.id)continue;var gg=byId[t.id];
var hist=((gg&&gg.history)||[]).filter(function(h){return h&&h.points!=null;});
var personal=gg&&(gg.accommodatedDueDate||gg.dueDate);
out.push({id:t.id,title:t.title,description:t.description||null,unit:un.title||null,unitSequence:un.sequence==null?null:un.sequence,sequence:t.sequence==null?null:t.sequence,startDate:t.startDate||null,dueDate:personal||t.dueDate||null,classDueDate:t.dueDate||null,points:t.points==null?null:t.points,type:t.type||'ASSIGNMENT',tags:t.tags||[],inPerson:!!t.inPerson,isGroupEnabled:!!t.isGroupEnabled,requiresLopesWrite:!!t.requiresLopesWrite,status:(gg&&gg.status)||null,submittedAt:(gg&&gg.assignmentSubmission&&gg.assignmentSubmission.submissionDate)||null,score:hist.length?hist[hist.length-1].points:null,
rubric:okRub?(rubrics[t.id]||null):undefined,
attachments:attachOf[t.id]||[],
quiz:okQz?(quizzes[t.id]||null):undefined,
feedback:okFb?feedbackOf(fb[t.id]):undefined});}}
}catch(e){prob(code,'this class',e);}
var who=(names[c.id]||[]).map(function(x){var u=x&&x.user;return u?((u.preferredFirstName||u.firstName||'')+' '+(u.lastName||'')).trim():'';}).filter(Boolean);
classes.push({id:c.id,slugId:c.slugId,classCode:c.classCode||'',courseCode:c.courseCode||'',name:c.name||'',instructors:who,startDate:c.startDate||null,endDate:c.endDate||null,stage:c.stage||null,modality:c.modality||null,credits:c.credits==null?null:c.credits,assessments:out,announcements:anns,resources:res,discussions:dqs,
gradeScale:(cur&&cur.gradeScale&&cur.gradeScale.entries)?cur.gradeScale.entries.filter(Boolean).map(function(E){return{label:E.label||'',minPercent:E.minPercent==null?null:E.minPercent,maxPercent:E.maxPercent==null?null:E.maxPercent};}):undefined,
holidays:(cur&&cur.holidays)?cur.holidays.filter(function(H){return H&&H.active!==false;}).map(function(H){return{title:H.title||'',description:H.description||null,startDate:H.startDate||null,duration:H.duration==null?null:H.duration};}):undefined,
participation:(cur&&cur.participationPolicy)?{description:cur.participationPolicy.description||null,days:cur.participationPolicy.numDays==null?null:cur.participationPolicy.numDays,posts:cur.participationPolicy.numPosts==null?null:cur.participationPolicy.numPosts}:undefined,
messages:msgs[c.id]||[]});}
var orch='';try{var NDx=document.getElementById('__NEXT_DATA__');var ND=NDx?JSON.parse(NDx.textContent):null;orch=(ND&&ND.runtimeConfig&&ND.runtimeConfig.orchestrationApiEndpoint)||'';if(!orch){throw new Error('No orchestrationApiEndpoint on the page');}}catch(e){orch='';prob(null,'rubric files',e);}
if(orch){try{var want=[];
for(var ci2=0;ci2<classes.length;ci2++){var AS=classes[ci2].assessments||[];
for(var ai2=0;ai2<AS.length;ai2++){var IT=AS[ai2];if(!IT||!IT.rubric)continue;var ATT=IT.attachments||[];
for(var xa=0;xa<ATT.length;xa++){if(ATT[xa]&&ATT[xa].resourceId){want.push(ATT[xa]);}}}}
want=want.slice(0,${MAX_RUBRIC_FILES});
for(var wi=0;wi<want.length;wi++){try{say('Getting rubric files ('+(wi+1)+' of '+want.length+')\\u2026');
var DR=await fetch(orch+'downloadUrl/'+want[wi].resourceId,{method:'GET',headers:{'Authorization':'Bearer '+s.authToken,'ContextToken':'Bearer '+s.contextToken}});
var DJ=await DR.json();var du=(DJ&&(DJ.downloadUrl||(DJ.result&&DJ.result.downloadUrl)))||'';
if(du){want[wi].downloadUrl=du;}}catch(e){prob(null,'rubric file',e);}}}catch(e){prob(null,'rubric files',e);}}
var schema=null;
if(problems.length){say('Asking Halo what its schema actually allows\\u2026');
try{var SR=await gql('HaloSchemaProbe',QS,{});
var qf=((((SR||{}).__schema||{}).queryType||{}).fields)||[];
var nameOf=function(t){var n='',d=0;while(t&&d<4){if(t.name){n=t.name;}t=t.ofType;d++;}return n;};
var want={getUserAlerts:1,getForumNotifications:1,posts:1,announcements:1,getCourseClassBySlugId:1,getInboxLeftPanel:1,getAllClassGrades:1,getGradeForUserCourseClassAssessment:1,getApplicableHolidaysForCourseClass:1,getCourseClassAssessmentById:1,getAllDQForCourseClass:1,userQuiz:1,userQuizResult:1,getForumId:1};
var names=[],detail={};
for(var si=0;si<qf.length;si++){var F=qf[si];if(!F||!F.name)continue;names.push(F.name);
if(want[F.name]){var ar=[];var al2=F.args||[];for(var ai3=0;ai3<al2.length;ai3++){if(al2[ai3]){ar.push(al2[ai3].name+': '+nameOf(al2[ai3].type));}}detail[F.name]=ar;}}
names.sort();
schema={queryFields:names,ours:detail,types:{}};
var probeTypes=['CourseClass','UserAlertsInputGQL','FilterInputGQL','Post'];
for(var ti=0;ti<probeTypes.length;ti++){try{var TR=await gql('HaloTypeProbe',QT,{name:probeTypes[ti]});var T=(TR||{}).__type;
if(T){var fl=[];var ff2=T.fields||T.inputFields||[];for(var fi3=0;fi3<ff2.length;fi3++){if(ff2[fi3]){fl.push(ff2[fi3].name);}}schema.types[probeTypes[ti]]=fl.sort();}}catch(e){schema.types[probeTypes[ti]]='could not read: '+((e&&e.message)||e);}}
}catch(e){schema={introspection:'refused',why:(e&&e.message)?String(e.message).slice(0,300):String(e)};prob(null,'schema probe',e);}}
var payload={kind:'halo-export',version:1,build:${JSON.stringify(BOOKMARKLET_BUILD)},exportedAt:new Date().toISOString(),source:MODE==='open'?'bookmarklet':'extension',classes:classes,alerts:alerts,problems:problems,schema:schema,pulls:['assessments','grades','instructors','announcements','class facts','instructor feedback','rubrics','class resources','discussions','quiz results','alerts','inbox']};
var n=0;for(var q=0;q<classes.length;q++){n+=(classes[q].assessments||[]).length;}
say('Read '+n+' assignment'+(n===1?'':'s')+' in '+classes.length+' class'+(classes.length===1?'':'es')+(problems.length?', '+problems.length+' thing'+(problems.length===1?'':'s')+' Halo would not give up':'')+'. Sending to the dashboard\\u2026');
var ackOrigin=MODE==='open'?D:location.origin;var got=false,ticks=0;var onMsg=function(e){if(e.origin===ackOrigin&&e.data&&e.data.kind==='halo-received'){got=true;}};
window.addEventListener('message',onMsg);
var t0=Date.now();
if(win){
await new Promise(function(res2){var iv=setInterval(function(){ticks++;if(got||Date.now()-t0>30000||win.closed){clearInterval(iv);res2();return;}try{win.postMessage(payload,D);}catch(e){}},400);});
}
else if(MODE==='message'){await new Promise(function(res2){var iv=setInterval(function(){ticks++;if(got||Date.now()-t0>5000){clearInterval(iv);res2();return;}try{window.postMessage(payload,location.origin);}catch(e){}},400);});}
window.removeEventListener('message',onMsg);
if(got){say('Sent to the dashboard. Review the changes there.');setTimeout(function(){box.remove();},4000);}
else{var why=MODE==='message'?'The extension did not pick up the export.':openErr?'Your browser blocked the dashboard tab from opening. Allow pop-ups for halo.gcu.edu, or open '+P+' yourself first.':(win&&win.closed)?'The dashboard tab was closed before the export arrived.':'The dashboard tab at '+P+' did not answer in 30 seconds. It has to be that exact address, and it has to finish loading.';fallback(JSON.stringify(payload),why);}
}catch(e){say('Halo sync failed: '+(e&&e.message?e.message:e));}
})();`;
  return code.replace(/\s*\n\s*/g, ' ').trim();
}

/** The `javascript:` URL to bookmark. */
export function bookmarkletHref(cfg: BookmarkletConfig): string {
  return `javascript:${encodeURIComponent(bookmarkletSource(cfg))}`;
}
