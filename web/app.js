import {extractRequirements,extractTitle,occupationsForSkills,createStrategies,validateBoolean,cleanUserTerms,dossier,download,short,ESCO_SOURCE} from './engine.js';

const $=id=>document.getElementById(id);
const state={catalog:null,title:'',jd:'',requirements:[],selected:new Set(),roles:[],strategies:[],overrides:{},active:'intake',analyzed:false};
const DEMO=`Industrial Automation Engineer

Role example — illustrative brief, not a live vacancy.

We are seeking an industrial automation engineer for a high-volume manufacturing operation.
Key responsibilities include monitoring production processes, maintaining electrical equipment and troubleshooting control systems.
Experience in industrial automation, quality assurance, programming industrial robots and preventive maintenance is valued.
Work closely with maintenance technicians and production teams to improve equipment reliability.
Preferred experience includes data analysis, quality control, and technical documentation.`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const initialText='NO SESSION';
const agoDate=iso=>{const d=new Date(iso);return Number.isFinite(+d)?new Intl.DateTimeFormat('en-GB',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(d):'UNKNOWN';};
let toastTimer=0;
function notify(message){let el=$('notification');if(!el){el=document.createElement('div');el.id='notification';el.setAttribute('role','status');Object.assign(el.style,{position:'fixed',bottom:'24px',right:'24px',maxWidth:'min(90vw,420px)',background:'#c1f68c',color:'#142017',padding:'15px 19px',font:'500 12px DM Mono,monospace',zIndex:'9999',boxShadow:'0 14px 40px #0008'});document.body.append(el);}el.textContent=message;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,3600);}
function setStatus(text,offline=false){$('data-status').classList.toggle('offline',offline);$('data-status').querySelector('span:last-child').textContent=text;}
async function loadCatalog(){
 try{
   const r=await fetch('./data/esco.json',{cache:'no-store'});if(!r.ok)throw new Error('Data snapshot not published yet');
   const data=await r.json();if(data.source!=='European Commission ESCO'||!data.occupations?.length||!data.skills?.length)throw new Error('ESCO snapshot failed integrity checks');
   state.catalog=data;
   setStatus('ESCO '+data.version+' · '+data.counts.occupations+' ROLES');
   $('atlas-version').textContent='ESCO '+data.version+' · '+agoDate(data.retrieved_at);
   $('analysis-mode').textContent='ESCO '+data.version+' / RULES-BASED';
   if(state.analyzed)analyze(false);
 }catch(error){
   state.catalog=null;setStatus('ESCO SYNC PENDING / MANUAL MODE',true);
   $('atlas-version').textContent='DATA SNAPSHOT NOT YET AVAILABLE';
   $('analysis-mode').textContent='MANUAL TERMS / NO TAXONOMY';
 }
}
function switchStage(stage){
 if(!['intake','atlas','twin','dossier'].includes(stage))return;
 state.active=stage;
 document.querySelectorAll('.workflow-tab').forEach(b=>{const active=b.dataset.stage===stage;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});
 document.querySelectorAll('.stage').forEach(p=>{const active=p.id==='panel-'+stage;p.classList.toggle('active',active);p.hidden=!active;});
 if(stage==='atlas')renderAtlas();if(stage==='twin')renderTwin();if(stage==='dossier')renderDossier();
 $('workspace-hint').textContent=({intake:'REVIEW THE ROLE REQUIREMENTS.',atlas:'EXPLORE VERIFIED OCCUPATION LINKS.',twin:'COMPARE SEARCH STRUCTURES.',dossier:'EXPORT THE RECRUITER-APPROVED STRATEGY.'})[stage];
}
function syncWords(){const text=$('job-description').value;const count=text.trim()?text.trim().split(/\s+/).length:0;$('word-count').textContent=count.toLocaleString('en-GB')+' WORDS';}
function analyze(showNotification=true){
 state.jd=$('job-description').value.trim();state.title=$('role-title').value.trim()||extractTitle(state.jd);
 if(!state.jd){notify('Paste a job description or load the illustrative example.');return;}
 if(!$('role-title').value.trim())$('role-title').value=state.title;
 state.requirements=extractRequirements(state.jd,state.catalog);
 state.selected=new Set(state.requirements.slice(0,10).map(r=>r.id));
 state.analyzed=true;
 $('intake-empty').hidden=true;$('intake-results').hidden=false;
 $('results-title').textContent=state.title;
 $('match-count').textContent=state.requirements.length;
 $('results-note').textContent=state.catalog?`Found ${state.requirements.length} candidate ESCO skill matches in your text. Review source evidence and uncheck inaccurate concepts.`:'No verified taxonomy currently published; add your own sourcing terms below until the ESCO snapshot is available.';
 renderRequirements();recompute();
 if(showNotification)notify('Role parsed locally. Review your selected requirements.');
}
function renderRequirements(){
 const root=$('requirements-list');root.replaceChildren();
 if(!state.requirements.length){const p=document.createElement('p');p.className='results-note';p.textContent='No verified taxonomy matches yet. This is not a claim that the role has no skill requirements. Add manual sourcing terms below.';root.append(p);return;}
 for(const req of state.requirements){
   const wrap=document.createElement('label');wrap.className='requirement';
   const cb=document.createElement('input');cb.type='checkbox';cb.checked=state.selected.has(req.id);cb.setAttribute('aria-label','Include '+req.name+' in search');cb.addEventListener('change',()=>{cb.checked?state.selected.add(req.id):state.selected.delete(req.id);recompute();});
   const content=document.createElement('div');content.className='requirement-body';
   const header=document.createElement('div');header.className='requirement-heading';
   const name=document.createElement('strong');name.textContent=req.name;const type=document.createElement('span');type.className='requirement-type';type.textContent=req.type==='preferred'?'PREFERRED / VERIFY':'REVIEW REQUIRED';header.append(name,type);
   const quote=document.createElement('p');quote.textContent='“'+req.evidence+'”';
   const cite=document.createElement('a');cite.href=ESCO_SOURCE;cite.target='_blank';cite.rel='noopener noreferrer';cite.textContent='SOURCE / ESCO CLASSIFICATION ↗';
   content.append(header,quote,cite);wrap.append(cb,content);root.append(wrap);
 }
}
function selectedTerms(){return state.requirements.filter(r=>state.selected.has(r.id));}
function recompute(){
 const ids=[...state.selected];state.roles=occupationsForSkills(state.catalog,ids,9);
 state.strategies=createStrategies({title:state.title,roles:state.roles,terms:selectedTerms().map(x=>x.name),extras:cleanUserTerms($('manual-skills').value)});
 for(const s of state.strategies)if(Object.prototype.hasOwnProperty.call(state.overrides,s.id))s.query=state.overrides[s.id];
 if(state.active==='atlas')renderAtlas();if(state.active==='twin')renderTwin();if(state.active==='dossier')renderDossier();
}
function graphSvg(roles,selected){
 if(!roles.length||!selected.length)return '';
 const skills=selected.slice(0,5);const os=roles.slice(0,6);
 const sk=skills.map((s,i)=>({id:s.id,name:s.name,x:130,y:70+i*(240/Math.max(1,skills.length-1))}));
 const ro=os.map((r,i)=>({id:r.id,name:r.name,x:515,y:55+i*(258/Math.max(1,os.length-1)),links:new Set(r.matched.map(x=>x.id)),essentials:new Set(r.matched.filter(x=>x.type==='essential').map(x=>x.id))}));
 const lines=ro.flatMap(r=>sk.filter(s=>r.links.has(s.id)).map(s=>`<line x1="${s.x}" y1="${s.y}" x2="${r.x}" y2="${r.y}" class="atlas-edge ${r.essentials.has(s.id)?'':'secondary'}"/>`)).join('');
 const ns=sk.map((s,i)=>`<circle cx="${s.x}" cy="${s.y}" r="9" class="atlas-node"/><text x="${s.x+18}" y="${s.y-11}" class="atlas-svg-label">${esc(short(s.name,26))}</text>`).join('');
 const rs=ro.map((r,i)=>`<circle cx="${r.x}" cy="${r.y}" r="9" class="atlas-node occupation"/><text x="${r.x-18}" y="${r.y-12}" text-anchor="end" class="atlas-svg-label">${esc(short(r.name,23))}</text>`).join('');
 return `<svg viewBox="0 0 650 365" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><g class="atlas-grid">${Array.from({length:12},(_,i)=>`<line x1="${i*60}" y1="0" x2="${i*60}" y2="365"/>`).join('')}${Array.from({length:8},(_,i)=>`<line x1="0" y1="${i*52}" x2="650" y2="${i*52}"/>`).join('')}</g>${lines}${ns}${rs}<text x="55" y="345" class="atlas-caption">SELECTED ESCO SKILLS</text><text x="455" y="345" class="atlas-caption">LINKED OCCUPATIONS</text></svg>`;
}
function renderAtlas(){
 const root=$('graph'),list=$('occupation-list');list.replaceChildren();
 const filtered=state.roles.filter(x=>x.name.toLowerCase().includes($('atlas-search').value.toLowerCase()));
 const sel=selectedTerms();
 if(!state.catalog){root.innerHTML='<div class="graph-empty"><strong>Classification pending.</strong>Run the ESCO snapshot workflow on GitHub to enable verified occupation links.</div>';}
 else if(!state.analyzed||!sel.length){root.innerHTML='<div class="graph-empty"><strong>Find the adjacent.</strong>Analyze a role and select at least one ESCO concept to explore actual ontology links.</div>';}
 else if(!filtered.length){root.innerHTML='<div class="graph-empty"><strong>No linked occupations.</strong>Try a different skill or clear your occupation filter.</div>';}
 else root.innerHTML=graphSvg(filtered,sel);
 $('atlas-total').textContent=filtered.length+' RELEVANT LINK'+(filtered.length===1?'':'S')+' / CAPPED TO 9';
 for(const role of filtered){const item=document.createElement('div');item.className='occupation-item';const left=document.createElement('div');const b=document.createElement('b');b.textContent=role.name;const sub=document.createElement('small');sub.textContent='ISCO '+(role.isco||'—')+' · '+role.essentialOverlap+' essential link(s)';left.append(b,document.createElement('br'),sub);const count=document.createElement('span');count.textContent=role.overlap+' LINK'+(role.overlap===1?'':'S');item.append(left,count);list.append(item);}
}
function renderTwin(){
 const root=$('strategy-cards');root.replaceChildren();
 if(!state.strategies.length)state.strategies=createStrategies({title:state.title,roles:state.roles,terms:selectedTerms().map(x=>x.name),extras:cleanUserTerms($('manual-skills').value)});
 state.strategies.forEach((s,i)=>{
   const card=document.createElement('article');card.className='strategy-card';
   const header=document.createElement('header');const tag=document.createElement('span');tag.textContent='STRATEGY / 0'+(i+1);const mark=document.createElement('span');mark.textContent=i===1?'THE MIDDLE PATH':'QUERY CONSTRUCTION';header.append(tag,mark);
   const title=document.createElement('h4');title.textContent=s.name;const sub=document.createElement('p');sub.textContent=s.sub;
   const stats=document.createElement('div');stats.className='strategy-stats';const a=document.createElement('span');a.innerHTML='<b>'+s.roleCount+'</b> TITLE PATHS';const b=document.createElement('span');b.innerHTML='<b>'+s.skillCount+'</b> SKILL TERMS';stats.append(a,b);
   const area=document.createElement('textarea');area.value=s.query;area.spellcheck=false;area.setAttribute('aria-label','Edit '+s.name+' Boolean search expression');area.rows=8;
   const validation=document.createElement('div');validation.className='syntax-row';
   const update=()=>{const v=validateBoolean(area.value);validation.textContent=(v.valid?'✓ ':'! ')+v.message;validation.classList.toggle('invalid',!v.valid);s.query=area.value;};
   area.addEventListener('input',()=>{state.overrides[s.id]=area.value;update();});update();
   const foot=document.createElement('footer');const approach=document.createElement('span');approach.textContent=s.approach;const copy=document.createElement('button');copy.textContent='COPY QUERY ↗';copy.type='button';copy.addEventListener('click',async()=>{if(!validateBoolean(area.value).valid){notify('Correct the Boolean syntax before copying.');return;}try{await navigator.clipboard.writeText(area.value);notify('Validated search query copied.');}catch{area.focus();area.select();notify('Clipboard access denied. Query selected for manual copy.');}});foot.append(approach,copy);
   card.append(header,title,sub,stats,area,validation,foot);root.append(card);
 });
}
function renderDossier(){
 const root=$('dossier-preview');root.replaceChildren();
 const shell=document.createElement('div');shell.className='dossier-paper';
 const title=document.createElement('h4');title.textContent='SOURCING / DOSSIER';
 const sub=document.createElement('p');sub.className='paper-sub';sub.textContent='SCOUTFORGE · REVIEW DOCUMENT · '+new Date().toISOString().slice(0,10);
 shell.append(title,sub);
 const lines=[['ROLE',state.title||'UNSPECIFIED'],['ESCO MATCHES',String(state.requirements.length)],['SELECTED FOR SEARCH',String(state.selected.size)],['LINKED OCCUPATIONS',String(state.roles.length)],['CLASSIFICATION',state.catalog?('ESCO '+state.catalog.version):'NOT PUBLISHED']];
 for(const [name,val] of lines){const r=document.createElement('div');r.className='paper-row';const b=document.createElement('b');b.textContent=name;const s=document.createElement('span');s.textContent=val;r.append(b,s);shell.append(r);}
 const block=(label,body)=>{const d=document.createElement('div');d.className='paper-section';const h=document.createElement('strong');h.textContent=label;const p=document.createElement('p');p.textContent=body;d.append(h,p);shell.append(d);};
 block('TOP EVIDENCE',selectedTerms().slice(0,5).map(r=>r.name).join(' · ')||'No verified taxonomy matches selected.');
 block('BALANCED SEARCH / SUMMARY',state.strategies[1]?.query||'Add a role title and terms to generate a query.');
 block('REVIEWER NOTES',$('reviewer-notes').value.trim()||'No reviewer notes entered.');
 const footer=document.createElement('div');footer.className='paper-footer';footer.textContent='NO CANDIDATE RECORDS / NOT A SEARCH RESULT / HUMAN REVIEW REQUIRED';shell.append(footer);root.append(shell);
}
function exportDossier(){if(!state.analyzed){notify('Analyze a role before exporting a sourcing dossier.');return;}
 const md=dossier({title:state.title,jd:state.jd,requirements:state.requirements,roles:state.roles,strategies:state.strategies,selected:[...state.selected],notes:$('reviewer-notes').value,source:state.catalog});
 download('ScoutForge-'+new Date().toISOString().slice(0,10)+'-sourcing-dossier.md',md,'text/markdown;charset=utf-8');notify('Sourcing dossier generated from this session.');}
const csvQuote=v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
function exportCsv(){if(!state.analyzed){notify('Analyze a role before exporting.');return;}
 const rows=[['record_type','role_title','name','status','evidence_or_query','source'],
 ...state.requirements.map(r=>['esco_skill',state.title,r.name,state.selected.has(r.id)?'included':'excluded',r.evidence,ESCO_SOURCE]),
 ...state.roles.map(o=>['esco_adjacent_occupation',state.title,o.name,o.overlap+' shared link(s)','Not a candidate qualification assessment',ESCO_SOURCE]),
 ...state.strategies.map(s=>['boolean_strategy',state.title,s.name,validateBoolean(s.query).valid?'valid':'needs_review',s.query,'ScoutForge compiled query'])];
 download('ScoutForge-sourcing-plan.csv','\ufeff'+rows.map(row=>row.map(csvQuote).join(',')).join('\r\n'),'text/csv;charset=utf-8');notify('Excel-ready UTF-8 CSV exported.');}
function clear(){state.title='';state.jd='';state.requirements=[];state.selected.clear();state.roles=[];state.strategies=[];state.overrides={};state.analyzed=false;
 $('role-title').value='';$('job-description').value='';$('manual-skills').value='';$('reviewer-notes').value='';$('atlas-search').value='';$('intake-empty').hidden=false;$('intake-results').hidden=true;syncWords();switchStage('intake');notify('Workbench cleared.');}
function boot(){
 document.querySelectorAll('[data-stage]').forEach(button=>button.addEventListener('click',()=>switchStage(button.dataset.stage)));
 document.querySelectorAll('[data-goto]').forEach(button=>button.addEventListener('click',()=>switchStage(button.dataset.goto)));
 $('job-description').addEventListener('input',syncWords);$('analyze').addEventListener('click',()=>analyze());
 $('example').addEventListener('click',()=>{$('role-title').value='Industrial Automation Engineer';$('job-description').value=DEMO;syncWords();analyze();notify('Illustrative manufacturing role loaded. No source claims are fabricated.');});
 $('clear').addEventListener('click',clear);$('manual-skills').addEventListener('input',()=>{if(state.analyzed)recompute();});
 $('role-title').addEventListener('change',()=>{if(state.analyzed){state.title=$('role-title').value.trim()||extractTitle(state.jd);$('results-title').textContent=state.title;recompute();}});
 $('select-all').addEventListener('click',()=>{state.selected=new Set(state.requirements.map(x=>x.id));renderRequirements();recompute()});
 $('deselect-all').addEventListener('click',()=>{state.selected.clear();renderRequirements();recompute()});
 $('atlas-search').addEventListener('input',renderAtlas);$('reviewer-notes').addEventListener('input',()=>{if(state.active==='dossier')renderDossier();});
 $('export-md').addEventListener('click',exportDossier);$('export-csv').addEventListener('click',exportCsv);$('print-dossier').addEventListener('click',()=>{if(!state.analyzed){notify('Analyze a role first.');return;}renderDossier();window.print();});
 document.querySelector('.workflow-nav').addEventListener('keydown',e=>{const tabs=[...document.querySelectorAll('.workflow-tab')];const idx=tabs.indexOf(document.activeElement);if(idx<0)return;let next;if(e.key==='ArrowRight')next=(idx+1)%tabs.length;else if(e.key==='ArrowLeft')next=(idx-1+tabs.length)%tabs.length;else return;e.preventDefault();tabs[next].focus();switchStage(tabs[next].dataset.stage);});
 switchStage('intake');loadCatalog();syncWords();
}
boot();