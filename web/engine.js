/* ScoutForge deterministic sourcing engine. Never profiles or ranks candidates. */
export const ESCO_SOURCE = 'https://esco.ec.europa.eu/en/use-esco/download';
const STOP = new Set('a an the and or of for with to in on at from by as is are be been it this that we our you your will should have has using use work able ability role job team position strong experience good knowledge skills skill relevant technical across into including'.split(' '));
const clean = s => String(s ?? '').normalize('NFKC').toLocaleLowerCase('en').replace(/[–—]/g,'-').replace(/\s+/g,' ').trim();
export const short = (s,n=80) => String(s ?? '').length>n ? String(s).slice(0,n-1)+'…' : String(s ?? '');
export const words = s => clean(s).match(/[a-z0-9+#.\-]+/g)||[];
export function safePhrase(s) {return '"'+String(s||'').replace(/["\\]/g,' ').replace(/\s+/g,' ').trim().slice(0,110)+'"';}
export function cleanUserTerms(value){return [...new Set(String(value||'').split(/[,\n;]/).map(x=>x.trim()).filter(x=>x.length>=2&&x.length<=90))].slice(0,12);}
export function extractTitle(jd){
  const first=String(jd||'').split('\n').map(x=>x.trim().replace(/^#+\s*/,'' )).filter(Boolean)[0]||'';
  const lowered=first.toLowerCase();
  if(first.length>100||/^(about|what |who |our |responsib|qualific|company|mission)/i.test(first))return 'Untitled role';
  return first.replace(/^(job title|role|position):\s*/i,'').slice(0,80)||'Untitled role';
}
function textFragments(jd){
  return String(jd||'').split(/\n|(?<=[.!?])\s+(?=[A-Z])/).map(s=>s.replace(/^[-*\d.)\s]+/,'').trim()).filter(s=>s.length>7).slice(0,120);
}
function includesTerm(source,term){
  const q=clean(term);if(q.length<4||STOP.has(q))return false;
  // Phrase boundary; avoid matching embedded words (e.g. "PLC" within unrelated token).
  const esc=q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return new RegExp('(^|[^a-z0-9])'+esc+'(?=$|[^a-z0-9])','i').test(clean(source));
}
function splitAliases(alt){return String(alt||'').split(/\n|\r|\|/).map(x=>x.trim()).filter(x=>x.length>=4&&x.length<90).slice(0,8)}
export function extractRequirements(jd,catalog){
  if(!jd||!catalog?.skills?.length)return [];
  const fragments=textFragments(jd), hits=[];
  for(const skill of catalog.skills){
    const terms=[skill.name,...splitAliases(skill.alt)];
    let best=null;
    for(const sentence of fragments){
      const term=terms.find(t=>includesTerm(sentence,t));
      if(term){best={id:skill.id,name:skill.name,matched:term,evidence:short(sentence,260),type:/\b(preferred|nice to have|bonus|plus|ideally|desirable|advantage|optional)\b/i.test(sentence)?'preferred':'review',source:ESCO_SOURCE};break}
    }
    if(best)hits.push(best);
  }
  // Most specific labels first; cap UI work, never misrepresent capped results as exhaustive.
  return hits.sort((a,b)=>b.matched.length-a.matched.length||a.name.localeCompare(b.name)).slice(0,28);
}
export function occupationsForSkills(catalog,selectedIds,max=9){
  if(!catalog?.occupations)return [];
  const ids=new Set(selectedIds);if(!ids.size)return [];
  return catalog.occupations.map(o=>{
    const matched=o.skills.filter(l=>ids.has(l.id));
    return {...o, matched, overlap:matched.length, essentialOverlap:matched.filter(x=>x.type==='essential').length};
  }).filter(o=>o.overlap>0).sort((a,b)=>b.overlap-a.overlap||b.essentialOverlap-a.essentialOverlap||a.name.localeCompare(b.name)).slice(0,max);
}
export function createStrategies({title,roles=[],terms=[],extras=[]}){
  const unique=a=>[...new Set(a.map(x=>String(x).trim()).filter(Boolean))];
  const baseTitle=title==='Untitled role'?[]:[title];
  const r=unique([...baseTitle,...roles.map(x=>x.name||x).filter(x=>typeof x==='string'||x?.name)]).slice(0,8);
  const s=unique([...terms,...extras]).slice(0,10);
  const or=group=>group.length? '('+group.map(safePhrase).join(' OR ')+')':'';
  const and=parts=>parts.filter(Boolean).join(' AND ');
  const precise=and([or(r.slice(0,1)),...s.slice(0,3).map(x=>or([x]))]);
  const balanced=and([or(r.slice(0,5)),or(s.slice(0,Math.max(2,Math.min(3,s.length))))]);
  const exploratory=and([or(r),or(s.slice(0,Math.max(2,Math.min(5,s.length))))]);
  return [
    {id:'precise',name:'Precision',sub:'Exact title + strict AND terms',query:precise,roleCount:Math.min(1,r.length),skillCount:Math.min(3,s.length),approach:'Narrow / verify hard constraints'},
    {id:'balanced',name:'Balanced',sub:'Adjacent titles + grouped skills',query:balanced,roleCount:Math.min(5,r.length),skillCount:Math.min(3,s.length),approach:'Transferable pathways / recruiter review'},
    {id:'explore',name:'Exploration',sub:'Broader role terms + skill family',query:exploratory,roleCount:r.length,skillCount:Math.min(5,s.length),approach:'Discovery / validate signal-to-noise'}
  ];
}
export function validateBoolean(query){
  const q=String(query||'').trim();if(!q)return {valid:false,message:'Add a title or selected term to construct a query.'};
  if(q.length>2000)return {valid:false,message:'Query exceeds 2,000 characters; reduce the groups.'};
  const toks=q.match(/"(?:[^"\\]|\\.)*"|\(|\)|\b(?:AND|OR|NOT)\b|[^\s()]+/gi)||[];
  let depth=0,needOperand=true;
  for(const t of toks){const op=t.toUpperCase();
    if(t==='('){if(!needOperand)return {valid:false,message:'Missing operator before opening parenthesis.'};depth++;continue;}
    if(t===')'){if(needOperand||depth===0)return {valid:false,message:'Unbalanced parentheses or empty clause.'};depth--;needOperand=false;continue;}
    if(['AND','OR'].includes(op)){if(needOperand)return {valid:false,message:'Operator without a preceding term.'};needOperand=true;continue;}
    if(op==='NOT'){if(!needOperand)return {valid:false,message:'NOT requires an operator before it.'};continue;}
    if(!needOperand)return {valid:false,message:'Missing AND/OR between search terms.'};
    if(t.startsWith('"')&&!t.endsWith('"'))return {valid:false,message:'Unterminated quoted phrase.'};
    needOperand=false;
  }
  if(depth||needOperand)return {valid:false,message:'Unbalanced parentheses or incomplete expression.'};
  return {valid:true,message:'Boolean syntax validated. Check platform-specific filtering rules before pasting.'};
}
export function dossier({title,jd,requirements,roles,strategies,selected,notes,source}){
  const line='---';const now=new Date().toISOString().slice(0,10);
  const md=[`# ScoutForge / sourcing strategy dossier`,`Generated: ${now}`,`Role: ${title||'Untitled role'}`,
    `Source classification: ${source?.source||'No taxonomy loaded'} (${source?.version||'n/a'})`,
    'Prepared for recruiter review. Not candidate-ranking advice.','',line,'## JD requirements (text evidence)', ...requirements.map((r,i)=>`${i+1}. **${r.name}** — ${r.type}\n   > ${r.evidence}`),
    requirements.length?'':'No verified ESCO matches identified; review JD manually.', '',line,'## Related occupations (ESCO shared-skill links)',
    ...roles.map((r,i)=>`${i+1}. ${r.name} — ${r.overlap} shared selected concept(s); occupational adjacency only.`),
    roles.length?'':'No occupation expansion available.', '',line,'## Boolean sourcing strategies',
    ...strategies.map(s=>`### ${s.name}\n\`\`\`\n${s.query||'Unavailable — specify a title/skill'}\n\`\`\`\n${s.approach}`),
    '',line,'## Recruiter notes', notes||'Not supplied', '',line,
    '## Methodology & limitations','Taxonomy overlap is a search discovery aid, not evidence of candidate suitability, availability, scarcity, or fairness.',
    'Boolean strings have not been executed against LinkedIn Recruiter or another candidate search platform.',
    'JD text processed locally in your browser; no candidate personal data is required.',
    `ESCO source: ${ESCO_SOURCE}`,'',`## Provided job description (for review)\n${jd||'Not supplied'}`];
  return md.join('\n');
}
export function download(name,text,type='text/plain'){
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}