/* ScoutForge Talent Sandbox: fictional ESCO-derived profiles + session-only imports.
   Never claims that any displayed profile is an available candidate. */
export const DEMO_NOTICE='FICTIONAL TALENT SANDBOX — not real or contactable candidates';
export const STAGES=['Research','Draft ready','Contacted (simulated)','Replied (simulated)'];
const norm=s=>String(s??'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
export const cleanTerms=value=>[...new Set(String(value||'').replace(/\s+(?:and|or)\s+/gi,',').split(/[,;|\n]+/).map(s=>s.trim()).filter(s=>s.length>=2&&s.length<=90))].slice(0,12);
const allText=p=>norm([p.title,p.family,p.location,...(p.skills||[])].join(' | '));
export function searchProfiles(profiles,{query='',region='',family='',max=120}={}){
 const terms=cleanTerms(query);const needle=norm(query);let result=[];
 for(const p of Array.isArray(profiles)?profiles:[]){
  if(region&&region!=='all'&&p.location!==region)continue;
  if(family&&family!=='all'&&p.family!==family)continue;
  const text=allText(p);
  const matched=terms.filter(t=>text.includes(norm(t)));
  if(terms.length&&!matched.length&&!(needle&&text.includes(needle)))continue;
  result.push({...p,matchedTerms:matched});
 }
 // Stable, repeatable display order. Keyword counts are for exploration, not a
 // ranking or an evaluation of any person's suitability for employment.
 result.sort((a,b)=>a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
 return {total:result.length,items:result.slice(0,Math.max(0,Math.min(500,max))),terms};
}
export function relatedSkills(profiles,query,limit=8){
 const terms=cleanTerms(query).map(norm),counts=new Map();
 for(const p of profiles||[])for(const skill of p.skills||[]){
  const key=norm(skill);if(terms.some(t=>key.includes(t)||t.includes(key)))continue;
  counts.set(skill,(counts.get(skill)||0)+1);
 }
 return [...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,limit).map(([skill,count])=>({skill,count}));
}
export function hypotheticalProfile(skill,{role='Exploratory role',region='Berlin–Brandenburg'}={}){
 const terms=cleanTerms(skill);if(!terms.length)throw Error('Enter a skill or search term first');
 let hash=2166136261;for(const ch of norm(terms.join('|'))){hash=Math.imul(hash^ch.charCodeAt(0),16777619)>>>0;}
 return {id:`WHATIF-${hash.toString(16).padStart(8,'0')}`,title:role&&role!=='Untitled role'?role:'Exploratory role',
  occupation_id:'',family:'Exploratory scenario',location:region,level:'Not specified',
  skills:terms,source:'hypothetical',
  summary:'On-demand fictional example constructed from your terms. This is not a real profile, verified qualification or indication of talent supply.'};
}
export function validateCatalog(data){
 if(data?.kind!=='synthetic_talent_sandbox'||!Array.isArray(data.profiles)||!data.profiles.length)throw Error('Invalid talent sandbox dataset');
 const ids=new Set();for(const p of data.profiles){if(!p.id||!p.title||!Array.isArray(p.skills)||!p.skills.length||ids.has(p.id)||p.source!=='synthetic_esco')throw Error('Invalid demo profile');ids.add(p.id);}
 return data;
}
export function csvEncode(rows){return rows.map(row=>row.map(value=>{
 const s=String(value??'');const guarded=/^[\s]*[=+@-]/.test(s)?`'${s}`:s;
 return `"${guarded.replace(/"/g,'""')}"`;
}).join(',')).join('\r\n')+'\r\n';}
export function exportQueue(queue,profiles){
 const byId=new Map((profiles||[]).map(p=>[p.id,p]));
 return csvEncode([['Profile ID','Demo role','Region','Source','Stage','Draft date / note','Disclaimer'],...(queue||[]).map(row=>{const p=byId.get(row.id);return [row.id,p?.title||'',p?.location||'',p?.source||'',row.stage||'Research',row.note||'','Synthetic sandbox; no outreach sent'];})]);
}
export function parseProfileCsv(raw){
 const text=String(raw||'').replace(/^\uFEFF/,'');if(text.length>2_000_000)throw Error('CSV file is too large');
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){
  const ch=text[i];if(quoted){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(ch==='"')quoted=false;else cell+=ch;}
  else if(ch==='"')quoted=true;
  else if(ch===','){row.push(cell);cell='';}
  else if(ch==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}
  else cell+=ch;
 }
 if(quoted)throw Error('CSV contains an unclosed quotation');
 if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}
 if(!rows.length)throw Error('CSV file has no rows');
 const header=rows.shift().map(s=>norm(s));
 if(header.some(v=>['email','name','phone','age','gender','birthdate','address'].includes(v)))throw Error('Remove personal fields. Import IDs, occupations, regions and skills only.');
 const indexes=['id','title','skills','region'].map(name=>header.indexOf(name));
 if(indexes.some(i=>i<0))throw Error('CSV needs id,title,skills,region columns');
 const used=new Set();const profiles=[];
 for(const row of rows){if(!row.some(v=>v.trim()))continue;if(profiles.length>=1000)throw Error('Import limit is 1,000 profiles');
  const [id,title,skills,location]=indexes.map(i=>(row[i]||'').trim());
  if(!id||!title||!skills||!location)continue;
  const safeId=id.slice(0,70);if(used.has(safeId))continue;used.add(safeId);
  const skillList=[...new Set(skills.split(/[|;]+/).map(s=>s.trim().slice(0,80)).filter(Boolean))].slice(0,35);
  if(!skillList.length)continue;
  profiles.push({id:'LOCAL-'+safeId,title:title.slice(0,130),occupation_id:'',family:'Session import',location:location.slice(0,80),level:'Not specified',skills:skillList,source:'imported_local',summary:'User-authorized session import. File stays in this browser session; no automatic outreach.'});
 }
 if(!profiles.length)throw Error('No usable profiles. Check required columns and skills separated by |.');
 return profiles;
}
export function funnelSummary(queue=[]){
 const counts=Object.fromEntries(STAGES.map(s=>[s,0]));for(const item of queue){if(item.stage in counts)counts[item.stage]++;}
 return {total:queue.length,counts};
}