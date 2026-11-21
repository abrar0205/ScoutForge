import {extractRequirements,extractTitle,occupationsForSkills,createStrategies,validateBoolean,cleanUserTerms,dossier,download,short,ESCO_SOURCE,taxonomyTest,outreachDraft} from './engine.js';
const $=id=>document.getElementById(id);
const state={catalog:null,title:'',jd:'',requirements:[],selected:new Set(),roles:[],strategies:[],overrides:{},active:'intake',analyzed:false,activeStrategy:'balanced',showAll:false};
const DEMO=`Industrial Automation Engineer

We are seeking an industrial automation engineer for a high-volume manufacturing operation.
Key responsibilities include monitoring production processes, maintaining electrical equipment and troubleshooting control systems.
Experience in industrial automation, quality assurance, programming industrial robots and preventive maintenance is valued.
Work closely with maintenance technicians and production teams to improve equipment reliability.
Preferred experience includes data analysis, quality control, and technical documentation.`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const agoDate=iso=>{const d=new Date(iso);return Number.isFinite(+d)?new Intl.DateTimeFormat('en-GB',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(d):'unknown';};
let toastTimer;
function notify(message){
  let el=$('notification');
  if(!el){el=document.createElement('div');el.id='notification';el.setAttribute('role','status');Object.assign(el.style,{position:'fixed',bottom:'20px',right:'20px',maxWidth:'min(90vw,350px)',background:'#b4f6c0',color:'#10231b',padding:'12px 17px',borderRadius:'7px',font:'600 12px DM Sans,sans-serif',zIndex:99,boxShadow:'0 10px 30px #0008'});document.body.append(el);}
  el.textContent=message;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,3500);
}
function setStatus(text,offline=false){$('data-status').classList.toggle('offline',offline);$('data-status').querySelector('span:last-child').textContent=text;}
async function loadCatalog(){
  try{
    const r=await fetch('./data/esco.json',{cache:'no-store'});if(!r.ok)throw Error('ESCO unavailable');
    const data=await r.json();if(data.source!=='European Commission ESCO'||!data.occupations?.length||!data.skills?.length)throw Error('ESCO snapshot invalid');
    state.catalog=data;setStatus('ESCO '+data.version+' · '+data.counts.occupations+' roles');
    $('atlas-version').textContent='ESCO '+data.version+' · '+agoDate(data.retrieved_at);
    $('analysis-mode').textContent='MATCHES FROM ESCO '+data.version;
    if(state.analyzed)analyze(false);
  }catch{
    state.catalog=null;setStatus('ESCO offline · manual terms work',true);
    $('atlas-version').textContent='ESCO snapshot not available';
    $('analysis-mode').textContent='MANUAL INPUT ONLY';
  }
}
function switchStage(stage){
  if(!['intake','twin','dossier'].includes(stage))return;
  if(stage!=='intake'&&!state.analyzed){notify('Analyze a job description first.');return;}
  state.active=stage;
  document.querySelectorAll('.workflow-tab').forEach(b=>{const on=b.dataset.stage===stage;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;});
  document.querySelectorAll('.stage').forEach(p=>{const on=p.id==='panel-'+stage;p.hidden=!on;});
  if(stage==='twin')renderTwin();if(stage==='dossier')renderDossier();
  $('workspace-hint').textContent=({intake:'START WITH A JOB DESCRIPTION.',twin:'EDIT, TEST, AND COPY YOUR QUERY.',dossier:'EXPORT FOR HUMAN REVIEW.'})[stage];
}
function syncWords(){const val=$('job-description').value;const n=val.trim()?val.trim().split(/\s+/).length:0;$('word-count').textContent=n.toLocaleString('en-GB')+' words';}
function analyze(announce=true){
  const jd=$('job-description').value.trim();if(!jd){notify('Paste a job description or try the example.');return;}
  const title=$('role-title').value.trim()||extractTitle(jd);state.jd=jd;state.title=title;state.analyzed=true;
  if(!$('role-title').value.trim()&&title!=='Untitled role')$('role-title').value=title;
  state.requirements=extractRequirements(jd,state.catalog);state.selected=new Set(state.requirements.slice(0,6).map(x=>x.id));
  state.overrides={};state.showAll=false;state.activeStrategy='balanced';
  $('outreach-draft').value=outreachDraft({title,terms:state.requirements.filter(x=>state.selected.has(x.id)).map(x=>x.name)});
  $('intake-empty').hidden=true;$('intake-results').hidden=false;
  $('results-title').textContent=title;renderRequirements();recompute();
  if(announce)notify('Role analyzed. Review the suggested skills.');
}
function renderRequirements(){
  const root=$('requirements-list');root.replaceChildren();$('match-count').textContent=state.requirements.length+' matched';
  $('results-note').textContent=state.catalog?`Skill terms or simple verb variants from your text. ${Math.min(state.requirements.length,6)} selected as a starting point.`:'ESCO is offline. Add your own sourcing terms below.';
  if(!state.requirements.length){const p=document.createElement('p');p.className='note';p.textContent='No exact taxonomy matches found. This does not mean the role has no skills; add your own terms.';root.append(p);}
  for(const req of (state.showAll?state.requirements:state.requirements.slice(0,6))){
    const item=document.createElement('label');item.className='requirement';
    const cb=document.createElement('input');cb.type='checkbox';cb.checked=state.selected.has(req.id);cb.setAttribute('aria-label','Include '+req.name+' in search');
    cb.addEventListener('change',()=>{if(cb.checked)state.selected.add(req.id);else state.selected.delete(req.id);recompute();});
    const body=document.createElement('div');body.className='requirement-content';
    const h=document.createElement('strong');h.textContent=req.name;
    if(req.type==='preferred'){const s=document.createElement('span');s.className='requirement-type';s.textContent='PREFERRED';h.append(s);}
    const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='See JD evidence';const p=document.createElement('p');p.textContent='“'+req.evidence+'”';details.append(summary,p);body.append(h,details);item.append(cb,body);root.append(item);
  }
  const more=$('show-more-skills');more.hidden=state.requirements.length<=6;more.textContent=state.showAll?'Show fewer ↑':`Show ${state.requirements.length-6} more ↓`;
}
function selectedTerms(){return state.requirements.filter(r=>state.selected.has(r.id));}
function recompute(){
  state.roles=occupationsForSkills(state.catalog,[...state.selected],9);
  state.strategies=createStrategies({title:state.title,roles:state.roles,terms:selectedTerms().map(x=>x.name),extras:cleanUserTerms($('manual-skills').value)});
  for(const s of state.strategies)if(Object.prototype.hasOwnProperty.call(state.overrides,s.id))s.query=state.overrides[s.id];
  if(state.active==='twin')renderTwin();if(state.active==='dossier')renderDossier();
}
function graphSvg(roles,selected){
  if(!roles.length||!selected.length)return '';
  const sk=selected.slice(0,5).map((s,i)=>({id:s.id,name:s.name,x:145,y:35+i*(220/Math.max(1,Math.min(5,selected.length)-1))}));
  const ro=roles.slice(0,6).map((r,i)=>({id:r.id,name:r.name,x:480,y:35+i*(220/Math.max(1,Math.min(6,roles.length)-1)),links:new Set(r.matched.map(x=>x.id)),essentials:new Set(r.matched.filter(x=>x.type==='essential').map(x=>x.id))}));
  const lines=ro.flatMap(r=>sk.filter(s=>r.links.has(s.id)).map(s=>`<line x1="${s.x}" y1="${s.y}" x2="${r.x}" y2="${r.y}" class="atlas-edge ${r.essentials.has(s.id)?'':'secondary'}"/>`)).join('');
  const nodes=[...sk.map(s=>`<circle cx="${s.x}" cy="${s.y}" r="6" class="atlas-node"/><text x="${s.x-12}" y="${s.y-10}" text-anchor="end" class="atlas-svg-label">${esc(short(s.name,22))}</text>`),...ro.map(r=>`<circle cx="${r.x}" cy="${r.y}" r="6" class="atlas-node occupation"/><text x="${r.x+10}" y="${r.y-10}" class="atlas-svg-label">${esc(short(r.name,21))}</text>`)].join('');
  return `<svg viewBox="0 0 650 292" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${lines}${nodes}<text x="20" y="280" class="atlas-caption">SELECTED SKILLS</text><text x="470" y="280" class="atlas-caption">LINKED ROLES</text></svg>`;
}
function renderAtlas(){
  const root=$('graph'),list=$('occupation-list');list.replaceChildren();const q=$('atlas-search').value.toLowerCase();const filtered=state.roles.filter(r=>r.name.toLowerCase().includes(q));
  if(!state.catalog)root.innerHTML='<div class="graph-empty">ESCO taxonomy unavailable.</div>';
  else if(!filtered.length||!selectedTerms().length)root.innerHTML='<div class="graph-empty">Select a skill to explore related occupations.</div>';
  else root.innerHTML=graphSvg(filtered,selectedTerms());
  $('atlas-total').textContent=filtered.length+' related occupation(s) in this view; capped at nine.';
  for(const role of filtered){const item=document.createElement('div');item.className='occupation-item';const title=document.createElement('div');const b=document.createElement('b');b.textContent=role.name;const sub=document.createElement('small');sub.textContent='ISCO '+(role.isco||'—')+' · '+role.essentialOverlap+' essential links';title.append(b,document.createElement('br'),sub);const count=document.createElement('span');count.textContent=role.overlap+' LINKS';item.append(title,count);list.append(item);}
}
function activeStrategy(){return state.strategies.find(x=>x.id===state.activeStrategy)||state.strategies[1];}
function renderTwin(){
  const opts=$('strategy-picks');opts.replaceChildren();
  for(const s of state.strategies){const b=document.createElement('button');b.type='button';b.textContent=s.name;b.classList.toggle('active',s.id===state.activeStrategy);b.setAttribute('aria-pressed',String(s.id===state.activeStrategy));b.addEventListener('click',()=>{state.activeStrategy=s.id;renderTwin();});opts.append(b);}
  const s=activeStrategy();if(!s)return;
  $('query-input').value=s.query;$('strategy-count').textContent=s.roleCount+' titles · '+s.skillCount+' skills';$('twin-interpretation').textContent=s.sub+'. '+s.approach+'.';
  $('metric-titles').textContent=s.roleCount;$('metric-skills').textContent=s.skillCount;
  updateQueryFeedback();
  if($('related-details').open)renderAtlas();
}
function updateQueryFeedback(){
  const s=activeStrategy();if(!s)return;const q=$('query-input').value;const v=validateBoolean(q);
  $('query-validation').textContent=(v.valid?'✓ ':'! ')+v.message;$('query-validation').classList.toggle('invalid',!v.valid);
  s.query=q;
  const result=taxonomyTest(state.catalog,q);
  $('metric-coverage').textContent=result.available?`${result.matched} / ${result.total}`:'—';
  const di=$('search-diagnostics');di.replaceChildren();
  if(result.available){const b=document.createElement('strong');b.textContent=result.matched+' ESCO occupation descriptions match';di.append(b,document.createTextNode(result.examples.length?' · e.g. '+result.examples.join(', '):' · no matches in this published subset.'));
  }else{di.textContent=v.valid?'ESCO coverage unavailable.':result.reason;}
  $('copy-query').disabled=!v.valid;
}
async function copyText(value,element,message){
  try{await navigator.clipboard.writeText(value);notify(message);}catch{
    element.focus();element.select();notify('Clipboard unavailable. Text selected for manual copying.');
  }
}
function renderDossier(){
  const root=$('dossier-preview');root.replaceChildren();const shell=document.createElement('div');
  const a=document.createElement('span');a.className='preview-eyebrow';a.textContent='SCOUTFORGE / SOURCING BRIEF';shell.append(a);
  const title=document.createElement('h4');title.className='preview-title';title.textContent=state.title||'Untitled role';shell.append(title);
  for(const [label,val] of [['Reviewed skills',state.selected.size],['Related occupations',state.roles.length],['Search strategies',state.strategies.length],['ESCO snapshot',state.catalog?'v'+state.catalog.version:'Unavailable']]){
    const row=document.createElement('div');row.className='preview-row';const x=document.createElement('span');x.textContent=label;const y=document.createElement('strong');y.textContent=String(val);row.append(x,y);shell.append(row);
  }
  const p=document.createElement('p');p.className='preview-note';p.textContent='Includes search expressions, cited JD sentences, recruiter notes and an editable outreach starter. No personal candidate records or actual recruiting results.';shell.append(p);root.append(shell);
}
function exportDossier(){
  if(!state.analyzed){notify('Analyze a job description first.');return;}
  download('ScoutForge-'+new Date().toISOString().slice(0,10)+'-sourcing-brief.md',dossier({title:state.title,jd:state.jd,requirements:state.requirements,roles:state.roles,strategies:state.strategies,selected:[...state.selected],notes:$('reviewer-notes').value,source:state.catalog,outreach:$('outreach-draft').value}),'text/markdown;charset=utf-8');notify('Sourcing brief downloaded.');
}
const csvQuote=x=>{let s=String(x??'');if(/^\s*[=+@\-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
function exportCsv(){
  if(!state.analyzed){notify('Analyze a job description first.');return;}
  const rows=[['record_type','role_title','name','status','evidence_or_query','source'],...selectedTerms().map(r=>['selected_esco_skill',state.title,r.name,r.type,r.evidence,ESCO_SOURCE]),
    ...state.roles.map(r=>['related_esco_occupation',state.title,r.name,`${r.overlap} shared concepts`,'Taxonomy link, not candidate assessment',ESCO_SOURCE]),
    ...state.strategies.map(s=>['boolean_query',state.title,s.name,validateBoolean(s.query).valid?'syntax_valid':'review_needed',s.query,'ScoutForge local compiler'])];
  download('ScoutForge-sourcing-plan.csv','\ufeff'+rows.map(row=>row.map(csvQuote).join(',')).join('\r\n'),'text/csv;charset=utf-8');notify('Excel-ready CSV downloaded.');
}
function clear(){
  Object.assign(state,{title:'',jd:'',requirements:[],selected:new Set(),roles:[],strategies:[],overrides:{},analyzed:false,activeStrategy:'balanced',showAll:false});
  ['role-title','job-description','manual-skills','reviewer-notes','outreach-draft','atlas-search'].forEach(id=>$(id).value='');
  $('intake-empty').hidden=false;$('intake-results').hidden=true;syncWords();switchStage('intake');notify('Workbench cleared.');
}
function boot(){
  document.querySelectorAll('.workflow-tab').forEach(b=>b.addEventListener('click',()=>switchStage(b.dataset.stage)));
  document.querySelectorAll('[data-goto]').forEach(b=>b.addEventListener('click',()=>switchStage(b.dataset.goto)));
  $('job-description').addEventListener('input',()=>{syncWords();if(state.analyzed){state.analyzed=false;$('intake-empty').hidden=false;$('intake-results').hidden=true;}});
  $('analyze').addEventListener('click',()=>analyze());
  $('example').addEventListener('click',()=>{$('role-title').value='Industrial Automation Engineer';$('job-description').value=DEMO;syncWords();analyze(false);notify('Illustrative manufacturing example loaded.');});
  $('clear').addEventListener('click',clear);
  $('role-title').addEventListener('change',()=>{if(state.analyzed){state.title=$('role-title').value.trim()||extractTitle(state.jd);$('results-title').textContent=state.title;recompute();}});
  $('manual-skills').addEventListener('input',()=>{if(state.analyzed)recompute();});
  $('select-all').addEventListener('click',()=>{state.selected=new Set(state.requirements.map(x=>x.id));renderRequirements();recompute();});
  $('deselect-all').addEventListener('click',()=>{state.selected.clear();renderRequirements();recompute();});
  $('show-more-skills').addEventListener('click',()=>{state.showAll=!state.showAll;renderRequirements();});
  $('query-input').addEventListener('input',()=>{if(!state.analyzed)return;const s=activeStrategy();state.overrides[s.id]=$('query-input').value;updateQueryFeedback();});
  $('reset-query').addEventListener('click',()=>{if(!state.analyzed)return;delete state.overrides[state.activeStrategy];recompute();notify('Query restored to generated version.');});
  $('copy-query').addEventListener('click',()=>{if(!validateBoolean($('query-input').value).valid){notify('Fix the Boolean syntax first.');return;}copyText($('query-input').value,$('query-input'),'Query copied for recruiter review.');});
  $('related-details').addEventListener('toggle',()=>{if($('related-details').open&&state.analyzed)renderAtlas();});
  $('atlas-search').addEventListener('input',renderAtlas);
  $('copy-outreach').addEventListener('click',()=>{if(!state.analyzed){notify('Analyze a job description first.');return;}copyText($('outreach-draft').value,$('outreach-draft'),'Outreach draft copied; review before sending.');});
  $('export-md').addEventListener('click',exportDossier);$('export-csv').addEventListener('click',exportCsv);
  document.querySelector('.step-nav').addEventListener('keydown',e=>{if(!['ArrowRight','ArrowLeft'].includes(e.key))return;const tabs=[...document.querySelectorAll('.workflow-tab')];const i=tabs.indexOf(document.activeElement);if(i<0)return;e.preventDefault();const idx=(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[idx].focus();switchStage(tabs[idx].dataset.stage);});
  switchStage('intake');loadCatalog();syncWords();
}
boot();