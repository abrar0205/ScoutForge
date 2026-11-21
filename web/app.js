import {extractRequirements,extractTitle,occupationsForSkills,createStrategies,validateBoolean,cleanUserTerms,dossier,download,short,ESCO_SOURCE,taxonomyTest,outreachDraft,GLOSSARY} from './engine.js';
import {downloadWorkbook} from './xlsx.js';
const $=id=>document.getElementById(id);
const state={catalog:null,analyzed:false,title:'',jd:'',requirements:[],selected:new Set(),roles:[],strategies:[],overrides:{},activeStrategy:'balanced',showAll:false};
const SAMPLE=`Industrial Automation Engineer

We are hiring an automation engineer for a high-volume manufacturing plant.
Experience with PLCs, Siemens S7 and TIA Portal is important. You will troubleshoot industrial automation systems, maintain electrical equipment and improve production reliability.
Knowledge of Python, SQL, preventive maintenance and quality control would be useful. This role involves communication with maintenance and production teams.`;
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normal=s=>String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
let toastTimer;
function toast(message){const el=$('notification');el.textContent=message;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,3400);}
function setStatus(value,offline=false){$('data-status').classList.toggle('offline',offline);$('data-status').querySelector('span:last-child').textContent=value;}
const activeTerms=()=>state.requirements.filter(r=>state.selected.has(r.id));
function countWords(){const val=$('job-description').value.trim();const n=val?val.split(/\s+/).length:0;$('word-count').textContent=n+' '+(n===1?'word':'words');}
function setFresh(){const outdated=!!state.stale;$('results').classList.toggle('stale',outdated);for(const id of ['export-xlsx','export-md','copy-query'])$(id).disabled=outdated;$('result-updated').hidden=!outdated;}
function markDirty(){if(!state.analyzed)return;state.stale=($('job-description').value.trim()!==state.jd||($('role-title').value.trim()||extractTitle($('job-description').value.trim()))!==state.title);setFresh();}
function setSource(){if(!state.catalog){setStatus('Manual keywords available',true);return;}setStatus('Skills library ready');}
async function loadCatalog(){
 try{const response=await fetch('./data/esco.json');if(!response.ok)throw Error('ESCO unavailable');
   const data=await response.json();if(data.source!=='European Commission ESCO'||!Array.isArray(data.occupations)||!data.occupations.length)throw Error('ESCO snapshot invalid');
   state.catalog=data;setSource();$('atlas-version').textContent=`ESCO ${data.version} · ${data.counts?.occupations||data.occupations.length} occupation records`;
   if(state.analyzed){const picked=new Set(activeTerms().map(r=>normal(r.name)));const manual=state.requirements.filter(r=>r.provenance==='manual');
     const next=extractRequirements(state.jd,data);state.requirements=[...next,...manual.filter(r=>!next.some(x=>normal(x.name)===normal(r.name)))];
     state.selected=new Set(state.requirements.filter(r=>picked.has(normal(r.name))||!picked.size&&r.provenance!=='manual').map(r=>r.id));rebuild();renderTerms();
   }
 }catch(e){state.catalog=null;setSource();$('atlas-version').textContent='ESCO taxonomy unavailable · manual sourcing still works';}
}
function ensureInput(){
 const jd=$('job-description').value.trim(),manualTitle=$('role-title').value.trim();
 if(!jd&&!manualTitle){toast('Paste a job description or enter a skill to begin.');$('job-description').focus();return false;}
 return true;
}
function generate({quiet=false}={}){
 if(!ensureInput())return;
 const jd=$('job-description').value.trim(),title=$('role-title').value.trim()||extractTitle(jd);
 state.jd=jd;state.title=title;state.analyzed=true;state.requirements=extractRequirements(jd,state.catalog);
 state.selected=new Set(state.requirements.slice(0,8).map(r=>r.id));state.showAll=false;state.activeStrategy='balanced';state.overrides={};state.stale=false;setFresh();
 $('results').hidden=false;$('results-title').textContent=title==='Untitled role'?'Skill-led sourcing plan':title;
 const keywordCount=state.requirements.length;
 $('results-subtitle').textContent=`${keywordCount} ${keywordCount===1?'term':'terms'} found in your text · review and refine below`;
 const few=jd&&jd.trim().split(/\s+/).length<=4;
 $('quickstart-note').hidden=!few;
 $('quickstart-note').textContent=few?(title==='Untitled role'?'Quick start: the input is a search term, not a full role description. Add a job title or more skills to make the search more specific.':'Quick start: we found a keyword and used your job title. Add more role requirements for a richer sourcing plan.'):'';
 $('outreach-draft').value=outreachDraft({title,terms:activeTerms().map(r=>r.name)});
 $('reviewer-notes').value='';$('related-details').open=false;$('outreach-details').open=false;$('evidence-details').open=false;
 rebuild();renderTerms();
 if(!quiet)toast(keywordCount?`Plan ready · ${keywordCount} search ${keywordCount===1?'term':'terms'} found`:'Plan ready · add a skill to make your search more specific');
 $('results').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
}
function rebuild(){
 const terms=activeTerms();state.roles=occupationsForSkills(state.catalog,terms.filter(r=>r.provenance==='esco').map(r=>r.id),9);
 const fresh=createStrategies({title:state.title,roles:state.roles,terms:terms.map(r=>r.name)});
 for(const s of fresh)if(Object.hasOwn(state.overrides,s.id))s.query=state.overrides[s.id];state.strategies=fresh;
 renderStrategies();if($('related-details').open)renderAtlas();
}
function updateSelected(id){if(state.selected.has(id))state.selected.delete(id);else state.selected.add(id);state.overrides={};rebuild();renderTerms();}
function renderTerms(){
 const root=$('terms-list');root.replaceChildren();
 const arr=state.showAll?state.requirements:state.requirements.slice(0,9);
 $('match-count').textContent=`${state.selected.size}/${state.requirements.length}`;
 if(!state.requirements.length){const p=document.createElement('p');p.className='tiny';p.textContent='No recognizable terms yet. Add any job skill below; you can still build a search from the role title.';root.append(p);}
 for(const req of arr){
  const on=state.selected.has(req.id),b=document.createElement('button');b.type='button';b.className='term-pill'+(on?' selected':'');b.setAttribute('aria-pressed',String(on));
  b.title=`${req.name} · ${req.provenance==='esco'?'Verified ESCO concept':req.provenance==='manual'?'Added by you':'Exact term in supplied text'}`;
  const mark=document.createElement('span');mark.className='term-icon';mark.textContent=on?'✓':'+';const label=document.createElement('span');label.textContent=req.name;b.append(mark,label);b.addEventListener('click',()=>updateSelected(req.id));root.append(b);
 }
 const more=$('show-more-skills');more.hidden=state.requirements.length<=9;more.textContent=state.showAll?'Show fewer ↑':`Show ${state.requirements.length-9} more ↓`;
 const e=$('evidence-list');e.replaceChildren();
 for(const req of state.requirements){const row=document.createElement('div');row.className='evidence-row';
  const h=document.createElement('strong');h.textContent=req.name;const src=document.createElement('small');src.textContent=req.provenance==='esco'?' · ESCO concept':req.provenance==='manual'?' · Added by recruiter':' · Exact JD keyword';
  const p=document.createElement('p');p.textContent=req.evidence?`“${req.evidence}”`:'Entered by recruiter';h.append(src);row.append(h,p);e.append(row);
 }
}
function activeStrategy(){return state.strategies.find(s=>s.id===state.activeStrategy)||state.strategies[0];}
function renderStrategies(){
 const root=$('strategy-picks');root.replaceChildren();
 for(const s of state.strategies){const b=document.createElement('button');b.type='button';b.textContent=s.name;b.classList.toggle('active',s.id===state.activeStrategy);b.setAttribute('aria-pressed',String(s.id===state.activeStrategy));
  b.addEventListener('click',()=>{state.activeStrategy=s.id;renderStrategies();});root.append(b);}
 const s=activeStrategy();if(!s)return;
 $('query-input').value=s.query;$('strategy-description').textContent=s.sub+'. '+s.approach;
 validateQuery();
}
function validateQuery(){
 const q=$('query-input').value;const result=validateBoolean(q),s=activeStrategy();if(s)s.query=q;
 $('query-validation').textContent=(result.valid?'✓  ':'!  ')+result.message;
 $('query-validation').classList.toggle('invalid',!result.valid);$('copy-query').disabled=!result.valid||!!state.stale;
 if($('related-details').open)renderAtlas();
}
function suggestionsFor(q){
 const query=normal(q);if(query.length<2)return [];
 const arr=[];const used=new Set(state.requirements.map(r=>normal(r.name)));
 for(const skill of state.catalog?.skills||[]){if(!used.has(normal(skill.name))&&normal(skill.name).includes(query))arr.push({name:skill.name,kind:'esco',id:skill.id});}
 for(const item of GLOSSARY){if(!used.has(normal(item.name))&&normal(item.name).includes(query))arr.push({name:item.name,kind:'keyword'});}
 return arr.sort((a,b)=>(normal(a.name).startsWith(query)?0:1)-(normal(b.name).startsWith(query)?0:1)||a.name.length-b.name.length).slice(0,6);
}
function renderSuggestions(){
 const q=$('skill-input').value.trim(),items=suggestionsFor(q),root=$('skill-suggestions');root.replaceChildren();root.hidden=!items.length;
 for(const item of items){const b=document.createElement('button');b.type='button';b.setAttribute('role','option');b.setAttribute('aria-label','Add '+item.name);
  const name=document.createElement('span');name.textContent=item.name;const src=document.createElement('small');src.textContent=item.kind==='esco'?'ESCO concept':'Suggested term';b.append(name,src);b.addEventListener('click',()=>addSkill(item.name,item.kind,item.id));root.append(b);}
}
function addSkill(value,kind='manual',id){const term=String(value??'').trim().replace(/[\r\n]+/g,' ').slice(0,90);
 if(term.length<2){toast('Type at least two characters.');return;}
 const existing=state.requirements.find(r=>normal(r.name)===normal(term));
 if(existing){state.selected.add(existing.id);$('add-status').textContent=`${existing.name} is already in your terms.`;}
 else{const input={id:kind==='esco'&&id?id:'manual:'+normal(term),name:term,evidence:'Added by recruiter',provenance:kind==='esco'?'esco':'manual',source:kind==='esco'?ESCO_SOURCE:'Recruiter'};
   state.requirements.unshift(input);state.selected.add(input.id);$('add-status').textContent=`Added ${term} to the search.`;}
 $('skill-input').value='';$('skill-suggestions').hidden=true;state.overrides={};rebuild();renderTerms();
 toast(`Added ${term}`);
}
function graphSvg(roles,chosen){if(!roles.length||!chosen.length)return '';
 const ss=chosen.slice(0,5).map((x,i)=>({...x,x:140,y:38+i*210/Math.max(1,Math.min(5,chosen.length)-1)}));
 const oo=roles.slice(0,6).map((x,i)=>({...x,x:490,y:38+i*210/Math.max(1,Math.min(6,roles.length)-1),ids:new Set(x.matched.map(m=>m.id))}));
 const links=oo.flatMap(o=>ss.filter(s=>o.ids.has(s.id)).map(s=>`<line x1="${s.x}" y1="${s.y}" x2="${o.x}" y2="${o.y}" class="atlas-edge"/>`)).join('');
 const nodes=[...ss.map(s=>`<circle cx="${s.x}" cy="${s.y}" r="6" class="atlas-node"/><text x="${s.x-14}" y="${s.y-10}" text-anchor="end" class="atlas-svg-label">${escape(short(s.name,21))}</text>`),...oo.map(o=>`<circle cx="${o.x}" cy="${o.y}" r="6" class="atlas-node occupation"/><text x="${o.x+10}" y="${o.y-10}" class="atlas-svg-label">${escape(short(o.name,22))}</text>`)].join('');
 return `<svg viewBox="0 0 720 278" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Linked skills and occupations">${links}${nodes}<text x="12" y="270" class="atlas-caption">REVIEWED ESCO SKILLS</text><text x="484" y="270" class="atlas-caption">LINKED OCCUPATIONS</text></svg>`;
}
function renderAtlas(){const root=$('graph'),list=$('occupation-list');list.replaceChildren();
 const selected=activeTerms().filter(r=>r.provenance==='esco');const q=normal($('atlas-search').value);
 const filtered=state.roles.filter(r=>normal(r.name).includes(q));
 root.innerHTML=filtered.length&&selected.length?graphSvg(filtered,selected):'<div class="graph-empty">No recorded ESCO occupation links for these selected terms. Your Boolean search still works.</div>';
 for(const role of filtered){const item=document.createElement('div');item.className='occupation-item';const a=document.createElement('div');const b=document.createElement('strong');b.textContent=role.name;const sub=document.createElement('small');sub.textContent=`ISCO ${role.isco||'—'} · ${role.essentialOverlap} essential links`;a.append(b,document.createElement('br'),sub);const count=document.createElement('span');count.textContent=`${role.overlap} links`;item.append(a,count);list.append(item);}
 $('atlas-total').textContent=`${filtered.length} related occupations from the published ESCO subset (maximum 9).`;
 const test=taxonomyTest(state.catalog,$('query-input').value);$('taxonomy-feedback').textContent=test.available?`${test.matched} of ${test.total} ESCO occupation records satisfy this exact query. This is NOT a count of candidates or available talent.`:test.reason;
}
async function copyText(text,target,message){
 try{await navigator.clipboard.writeText(text);toast(message);}catch{target.focus();target.select();toast('Clipboard unavailable; text selected for manual copying.');}
}
function exportBrief(){if(state.stale){toast('Regenerate the strategy after editing the role.');return;}download('ScoutForge-sourcing-brief.md',dossier({title:state.title,jd:state.jd,requirements:state.requirements,roles:state.roles,strategies:state.strategies,selected:[...state.selected],notes:$('reviewer-notes').value,source:state.catalog,outreach:$('outreach-draft').value}),'text/markdown;charset=utf-8');toast('Sourcing brief downloaded.');}
function exportExcel(){if(state.stale){toast('Regenerate the strategy after editing the role.');return;}downloadWorkbook({title:state.title==='Untitled role'?'Skill-led search':state.title,terms:activeTerms(),strategies:state.strategies,source:state.catalog,notes:$('reviewer-notes').value});toast('Excel workbook downloaded.');}
function clear(){state.analyzed=false;state.stale=false;state.title='';state.jd='';state.requirements=[];state.selected.clear();state.roles=[];state.strategies=[];state.overrides={};
 ['job-description','role-title','skill-input','outreach-draft','reviewer-notes','atlas-search'].forEach(id=>$(id).value='');$('results').hidden=true;countWords();$('job-description').focus();toast('Workspace cleared.');}
function init(){
 $('job-description').addEventListener('input',()=>{countWords();markDirty();});
 $('role-title').addEventListener('input',markDirty);
 $('job-description').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();generate();}});
 $('analyze').addEventListener('click',()=>generate());
 $('example').addEventListener('click',()=>{$('job-description').value=SAMPLE;$('role-title').value='Industrial Automation Engineer';countWords();generate({quiet:true});toast('Manufacturing example loaded. All terms can be reviewed.');});
 $('clear').addEventListener('click',clear);
 $('edit-role').addEventListener('click',()=>{$('intake').scrollIntoView({behavior:'smooth',block:'start'});$('job-description').focus({preventScroll:true});});
 $('show-more-skills').addEventListener('click',()=>{state.showAll=!state.showAll;renderTerms();});
 $('skill-input').addEventListener('input',renderSuggestions);
 $('skill-input').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();const items=suggestionsFor($('skill-input').value);const exact=items.find(x=>normal(x.name)===normal($('skill-input').value));addSkill(exact?.name||$('skill-input').value,exact?.kind,exact?.id);}if(e.key==='Escape')$('skill-suggestions').hidden=true;});
 $('add-skill').addEventListener('click',()=>{const items=suggestionsFor($('skill-input').value);const exact=items.find(x=>normal(x.name)===normal($('skill-input').value));addSkill(exact?.name||$('skill-input').value,exact?.kind,exact?.id);});
 $('query-input').addEventListener('input',()=>{if(!state.analyzed)return;state.overrides[state.activeStrategy]=$('query-input').value;validateQuery();});
 $('reset-query').addEventListener('click',()=>{delete state.overrides[state.activeStrategy];rebuild();toast('Search reset to generated version.');});
 $('copy-query').addEventListener('click',()=>{if(validateBoolean($('query-input').value).valid)copyText($('query-input').value,$('query-input'),'Search copied. Check it in your sourcing platform.');});
 $('related-details').addEventListener('toggle',()=>{if($('related-details').open&&state.analyzed)renderAtlas();});
 $('atlas-search').addEventListener('input',renderAtlas);
 $('copy-outreach').addEventListener('click',()=>copyText($('outreach-draft').value,$('outreach-draft'),'Unsent outreach draft copied. Personalize before sending.'));
 $('export-md').addEventListener('click',exportBrief);$('export-xlsx').addEventListener('click',exportExcel);
 countWords();loadCatalog();
}
init();