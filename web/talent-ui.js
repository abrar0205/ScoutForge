import {DEMO_NOTICE,STAGES,searchProfiles,relatedSkills,hypotheticalProfile,validateCatalog,parseProfileCsv,exportQueue,funnelSummary} from './talent.js';
import {download,outreachDraft} from './engine.js';
const $=id=>document.getElementById(id);
const normal=s=>String(s||'').trim().toLowerCase();
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const locations=['Berlin–Brandenburg','Leipzig','Dresden','Munich','Stuttgart','Hamburg','Nuremberg','Hannover'];
const roles=[
 ['Automation engineer','Automation & maintenance',['PLC','Siemens S7','TIA Portal','SCADA','Industrial automation','Python','Robotics','Preventive maintenance']],
 ['Data engineer','Software & data',['Python','SQL','Power BI','ETL','Snowflake','Data engineering','AWS']],
 ['Software developer','Software & data',['JavaScript','TypeScript','React','Python','SQL','Git','Docker']],
 ['Quality engineer','Manufacturing & quality',['Quality control','Lean manufacturing','Six Sigma','Excel','SAP']],
 ['Maintenance technician','Automation & maintenance',['PLC','Troubleshooting','Siemens S7','Robotics','Preventive maintenance']],
 ['Talent sourcing specialist','Talent & operations',['Recruiting','Active sourcing','Boolean search','LinkedIn Recruiter','Excel','Power Automate']],
 ['Supply chain analyst','Supply chain & logistics',['SAP','Excel','SQL','ERP','Logistics','Supply chain']],
 ['Project coordinator','Talent & operations',['Excel','Power Apps','Power Automate','Project management','Communication']],
 ['Machine learning engineer','Software & data',['Python','Machine learning','Deep learning','LLM','SQL','Docker']],
 ['Design engineer','Design & research',['CAD','MATLAB','Simulink','SolidWorks','Quality control']],
 ['Production operator','Manufacturing & quality',['Quality assurance','Lean manufacturing','Production','Equipment maintenance']],
 ['Business analyst','Software & data',['Excel','Power BI','SQL','Data analysis','Dashboarding']],
];
function starterPool(){const profiles=[];
 for(let i=0;i<roles.length;i++)for(let n=0;n<5;n++){
  const [title,family,skills]=roles[i];profiles.push({id:`START-${String(i*5+n+1).padStart(3,'0')}`,title,family,
   location:locations[(i+n*3)%locations.length],level:['Early career','Experienced','Specialist'][n%3],
   skills:[...skills.slice(n%3),...skills.slice(0,n%3)].slice(0,skills.length),source:'synthetic_starter',occupation_id:'',
   summary:`Fictional ${title.toLowerCase()} illustration. This offline starter set is an editorial demo, not verified individual qualifications.`});
 }return profiles;
}
function safeStorageRead(){try{const raw=JSON.parse(localStorage.getItem('scoutforge-sandbox-queue-v1')||'[]');if(!Array.isArray(raw))return [];
 return raw.filter(x=>typeof x?.id==='string'&&x.id.length<100&&STAGES.includes(x.stage)).slice(0,150);}catch{return [];}}
function store(queue){try{localStorage.setItem('scoutforge-sandbox-queue-v1',JSON.stringify(queue.filter(x=>!x.id.startsWith('LOCAL-'))));}catch{}}
export function initTalent({getRoleContext,toast}={}){
 const state={profiles:starterPool(),custom:[],imports:[],queue:safeStorageRead(),term:'',region:'all',family:'all',page:0,view:'profiles',activeId:null,role:'',loaded:false};
 const getAll=()=>[...state.custom,...state.imports,...state.profiles];
 const find=id=>getAll().find(p=>p.id===id);
 const alert=message=>typeof toast==='function'?toast(message):console.info(message);
 const setStatus=label=>{$('talent-data-status').textContent=label;$('talent-corpus-count').textContent=`${state.profiles.length.toLocaleString('en-US')} fictional profiles`;};
 const fillFilters=()=>{
  const regions=[...new Set(getAll().map(p=>p.location))].sort();
  const r=$('talent-region'),selected=r.value||'all';r.replaceChildren(new Option('All regions','all'),...regions.map(n=>new Option(n,n)));r.value=regions.includes(selected)?selected:'all';
  const families=[...new Set(getAll().map(p=>p.family))].sort();
  const f=$('talent-family'),sel=f.value||'all';f.replaceChildren(new Option('All job families','all'),...families.map(n=>new Option(n,n)));f.value=families.includes(sel)?sel:'all';
 };
 const queueStatus=()=>{const stats=funnelSummary(state.queue);
  $('talent-queue-count').textContent=String(stats.total);
  $('talent-queue-summary').textContent=stats.total?`${stats.total} saved in this browser · no real messages sent`:'No demo profiles added yet';
  const chart=$('talent-funnel');chart.replaceChildren();
  for(const stage of STAGES){const row=document.createElement('div');row.className='talent-bar-row';
   const n=stats.counts[stage]||0;const width=stats.total?Math.round(n/stats.total*100):0;
   row.innerHTML=`<span>${escape(stage)}</span><div class="talent-bar-track"><i style="width:${width}%"></i></div><strong>${n}</strong>`;chart.append(row);
  }
 };
 const renderQueue=()=>{
  const box=$('talent-queue-list');box.replaceChildren();queueStatus();
  if(!state.queue.length){box.innerHTML='<div class="talent-empty-queue">Save a fictional profile from the browser to start an outreach simulation. Nothing is sent.</div>';return;}
  for(const row of state.queue){const p=find(row.id);const line=document.createElement('article');line.className='talent-queue-line';
   const heading=document.createElement('div');heading.innerHTML=`<strong>${escape(p?.title||row.title||row.id)}</strong><small>${escape(row.id)} · fictional</small>`;
   const select=document.createElement('select');select.setAttribute('aria-label',`Demo stage for ${row.id}`);
   for(const stage of STAGES)select.add(new Option(stage,stage));select.value=row.stage;
   select.addEventListener('change',()=>{row.stage=select.value;store(state.queue);queueStatus();});
   const rm=document.createElement('button');rm.className='talent-remove';rm.type='button';rm.textContent='Remove';rm.addEventListener('click',()=>{state.queue=state.queue.filter(x=>x.id!==row.id);store(state.queue);renderQueue();renderProfiles();});
   line.append(heading,select,rm);box.append(line);
  }
 };
 const showView=view=>{state.view=view;
  $('talent-tab-explore').classList.toggle('active',view==='profiles');$('talent-tab-queue').classList.toggle('active',view==='queue');
  $('talent-profiles-panel').hidden=view!=='profiles';$('talent-queue-panel').hidden=view!=='queue';
  if(view==='queue')renderQueue();else renderProfiles();
 };
 const renderLandscape=hits=>{
  const root=$('talent-landscape');root.replaceChildren();
  const map=new Map();for(const p of hits){map.set(p.family,(map.get(p.family)||0)+1);}
  const ranked=[...map].sort((a,b)=>b[1]-a[1]).slice(0,4);
  if(!ranked.length){root.hidden=true;return;}root.hidden=false;
  const max=ranked[0][1];for(const [family,count] of ranked){const item=document.createElement('div');item.className='talent-landscape-item';
   item.innerHTML=`<span title="${escape(family)}">${escape(family)}</span><div class="talent-landscape-track"><i style="width:${Math.max(2,Math.round(count/max*100))}%"></i></div><strong>${count}</strong>`;
   root.append(item);
  }
 };
 const renderProfiles=()=>{
  const profiles=getAll(),query=$('talent-search').value.trim();state.term=query;
  const {total,items}=searchProfiles(profiles,{query,region:state.region,family:state.family,max:500});
  const pageItems=items.slice(0,(state.page+1)*9);
  $('talent-result-count').textContent=`${total.toLocaleString('en-US')} ${total===1?'demo profile':'demo profiles'}${query?' in search':''}`;
  $('talent-show-more').hidden=pageItems.length>=total;
  $('talent-whatif').hidden=!!total||!query;
  $('talent-whatif-term').textContent=query;
  renderLandscape(items);
  const list=$('talent-profile-list');list.replaceChildren();
  for(const p of pageItems){const matched=p.matchedTerms||[];
   const item=document.createElement('article');item.className='talent-profile';
   const saved=state.queue.some(q=>q.id===p.id);
   item.innerHTML=`<div class="talent-profile-top"><span class="talent-id">${escape(p.id)}</span><span class="talent-source ${p.source==='hypothetical'?'whatif':''}">${p.source==='hypothetical'?'WHAT-IF EXAMPLE':p.source==='imported_local'?'SESSION IMPORT':'FICTIONAL'}</span></div>
   <h4>${escape(p.title)}</h4><p class="talent-meta">${escape(p.location)} · ${escape(p.level)}</p>
   <div class="talent-skill-chips">${p.skills.slice(0,4).map(s=>`<span class="${matched.some(t=>normal(t)===normal(s))?'hit':''}">${escape(s)}</span>`).join('')} ${p.skills.length>4?`<span>+${p.skills.length-4}</span>`:''}</div>
   <div class="talent-profile-actions"><button class="talent-link" type="button" data-view="${escape(p.id)}">View details</button><button class="talent-add ${saved?'saved':''}" type="button" data-add="${escape(p.id)}">${saved?'✓ Saved':'＋ Save to demo queue'}</button></div>`;
   list.append(item);
  }
  list.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>openProfile(button.dataset.view)));
  list.querySelectorAll('[data-add]').forEach(button=>button.addEventListener('click',()=>addToQueue(button.dataset.add)));
  queueStatus();
 };
 const addToQueue=id=>{const p=find(id);if(!p)return;
  if(state.queue.some(x=>x.id===id)){showView('queue');return;}
  state.queue.push({id,stage:'Research',title:p.title});store(state.queue);renderProfiles();alert('Fictional profile saved to your demo queue.');
 };
 const openProfile=id=>{
  const p=find(id);if(!p)return;state.activeId=id;
  $('talent-dialog-title').textContent=p.title;
  $('talent-dialog-meta').textContent=`${p.id} · ${p.location} · ${p.level} · ${p.source==='synthetic_esco'?'Fictional example':p.source==='hypothetical'?'On-demand what-if scenario':'Session-only import'}`;
  $('talent-dialog-summary').textContent=p.summary;
  const box=$('talent-dialog-skills');box.replaceChildren();for(const skill of p.skills){const chip=document.createElement('span');chip.textContent=skill;box.append(chip);}
  const role=getRoleContext?.()?.title||state.role||'a relevant opportunity';
  $('talent-dialog-draft').value=`Hi [First name],\n\nI'm reaching out about ${role}. Your experience with [verified and approved skill] might be relevant to the opportunity.\n\nWould you be open to hearing more about the role?\n\nBest,\n[Recruiter name]`;
  $('talent-dialog-add').textContent=state.queue.some(x=>x.id===id)?'In demo queue':'Save to demo queue';
  const dlg=$('talent-dialog');if(!dlg.open)dlg.showModal();
 };
 const safeCopy=async value=>{try{await navigator.clipboard.writeText(value);alert('Unsent draft copied. Review before use.');}catch{const a=$('talent-dialog-draft');a.select();document.execCommand('copy');alert('Draft selected for copying.');}};
 const load=async()=>{
  try{const response=await fetch('./data/talent-sandbox.json',{cache:'force-cache'});if(!response.ok)throw Error('Sandbox snapshot not found');const catalog=validateCatalog(await response.json());state.profiles=catalog.profiles;state.loaded=true;setStatus('ESCO-derived demo library ready');}
  catch{setStatus('Starter demo library ready');}
  fillFilters();renderProfiles();
 };
 $('talent-tab-explore').addEventListener('click',()=>showView('profiles'));
 $('talent-tab-queue').addEventListener('click',()=>showView('queue'));
 $('talent-search').addEventListener('input',()=>{state.page=0;renderProfiles();});
 $('talent-search-submit').addEventListener('click',()=>{state.page=0;renderProfiles();});
 $('talent-region').addEventListener('change',()=>{state.region=$('talent-region').value;state.page=0;renderProfiles();});
 $('talent-family').addEventListener('change',()=>{state.family=$('talent-family').value;state.page=0;renderProfiles();});
 $('talent-show-more').addEventListener('click',()=>{state.page++;renderProfiles();});
 $('talent-whatif-create').addEventListener('click',()=>{const input=$('talent-search').value.trim();if(!input)return;const obj=hypotheticalProfile(input,{role:getRoleContext?.()?.title||state.role||'Exploratory role'});
  if(!find(obj.id))state.custom.push(obj);state.family='all';state.region='all';fillFilters();renderProfiles();alert('What-if fictional example created. It is not a real candidate.');});
 $('talent-dialog-close').addEventListener('click',()=>$('talent-dialog').close());
 $('talent-dialog-add').addEventListener('click',()=>{addToQueue(state.activeId);$('talent-dialog').close();});
 $('talent-dialog-copy').addEventListener('click',()=>safeCopy($('talent-dialog-draft').value));
 $('talent-export-csv').addEventListener('click',()=>{download('ScoutForge-demo-queue.csv',exportQueue(state.queue,getAll()),'text/csv;charset=utf-8');alert('Demo queue exported; no real outreach was performed.');});
 $('talent-clear-queue').addEventListener('click',()=>{state.queue=[];store(state.queue);renderQueue();renderProfiles();alert('Demo queue reset.');});
 $('talent-import-csv').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;
  try{state.imports=parseProfileCsv(await file.text());fillFilters();state.region='all';state.family='all';$('talent-search').value='';state.page=0;showView('profiles');alert(`${state.imports.length} session-only profile records imported.`);}
  catch(error){alert(error.message);}finally{e.target.value='';}
 });
 window.addEventListener('scoutforge:role-ready',event=>{
  const terms=(event.detail?.terms||[]).slice(0,2).filter(Boolean);
  state.role=event.detail?.title||'';
  if(terms.length){$('talent-search').value=terms.join(', ');state.region='all';state.family='all';fillFilters();state.page=0;renderProfiles();}
 });
 fillFilters();renderProfiles();load();
 return {getQueue:()=>state.queue.map(x=>({...x})),getProfiles:()=>getAll(),search:q=>{$('talent-search').value=q;state.page=0;showView('profiles');}};
}