/* ScoutForge: auditable, browser-only sourcing intelligence. Never ranks people. */
export const ESCO_SOURCE = 'https://esco.ec.europa.eu/en/use-esco/download';
const STOP = new Set('a an the and or of for with to in on at from by as is are be been it this that we our you your will should have has using use work able ability role job team position strong experience good knowledge skills skill relevant technical across into including'.split(' '));
const clean = s => String(s ?? '').normalize('NFKC').toLocaleLowerCase('en').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
export const short = (s, n=80) => String(s ?? '').length > n ? String(s).slice(0,n-1)+'…' : String(s ?? '');
export const words = s => clean(s).match(/[a-z0-9+#.\-]+/g) || [];
export function safePhrase(s){return '"'+String(s||'').replace(/["\\]/g,' ').replace(/\s+/g,' ').trim().slice(0,110)+'"';}
export function cleanUserTerms(value){return [...new Set(String(value||'').split(/[,\n;]/).map(x=>x.trim()).filter(x=>x.length>=2&&x.length<=90))].slice(0,12);}
export function extractTitle(jd){
  const first=String(jd||'').split('\n').map(x=>x.trim().replace(/^#+\s*/,'')).filter(Boolean)[0]||'';
  if(first.length>100||/^(about|what |who |our |responsib|qualific|company|mission)/i.test(first))return 'Untitled role';
  return first.replace(/^(job title|role|position):\s*/i,'').slice(0,80)||'Untitled role';
}
function textFragments(jd){
  return String(jd||'').split(/\n|(?<=[.!?])\s+(?=[A-Z])/).map(s=>s.replace(/^[-*\d.)\s]+/,'').trim()).filter(s=>s.length>7).slice(0,150);
}
function includesTerm(source,term){
  const q=clean(term);if(q.length<2 || STOP.has(q))return false;
  if(q.length<4 && !/^[A-Z\d#+.\-]{2,3}$/.test(String(term)))return false;
  const esc=q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  if(new RegExp('(^|[^a-z0-9])'+esc+'(?=$|[^a-z0-9])','i').test(clean(source)))return true;
  // Common -ing verb variants in multiword ESCO phrases, still requiring all
  // other words next to each other. Not an LLM/semantic inference.
  const target=words(q),tokens=words(source);
  if(target.length<2 || target[0].length<5)return false;
  const stem=t=>{if(!t.endsWith('ing')||t.length<7)return t;const base=t.slice(0,-3);return base.length>2&&base.at(-1)===base.at(-2)?base.slice(0,-1):base;};
  for(let i=0;i<=tokens.length-target.length;i++){
    if(stem(tokens[i])!==target[0])continue;
    if(target.slice(1).every((w,j)=>tokens[i+j+1]===w))return true;
  }
  return false;
}
function splitAliases(alt){return String(alt||'').split(/\n|\r|\|/).map(x=>x.trim()).filter(x=>x.length>=2&&x.length<90).slice(0,8);}
export function extractRequirements(jd,catalog){
  if(!jd||!catalog?.skills?.length)return [];
  const fragments=textFragments(jd),hits=[];
  for(const skill of catalog.skills){
    const terms=[skill.name,...splitAliases(skill.alt)];
    let best=null;
    for(const sentence of fragments){
      const term=terms.find(t=>includesTerm(sentence,t));
      if(term){best={id:skill.id,name:skill.name,matched:term,evidence:short(sentence,280),type:/\b(preferred|nice to have|bonus|plus|ideally|desirable|advantage|optional)\b/i.test(sentence)?'preferred':'review',source:ESCO_SOURCE};break;}
    }
    if(best)hits.push(best);
  }
  // Sort specific phrases first. Selection is a suggestion and must be reviewed.
  return hits.sort((a,b)=>b.matched.length-a.matched.length||a.name.localeCompare(b.name)).slice(0,28);
}
export function occupationsForSkills(catalog,selectedIds,max=9){
  if(!catalog?.occupations)return [];
  const ids=new Set(selectedIds);if(!ids.size)return [];
  return catalog.occupations.map(o=>{
    const matched=(o.skills||[]).filter(l=>ids.has(l.id));
    return {...o,matched,overlap:matched.length,essentialOverlap:matched.filter(x=>x.type==='essential').length};
  }).filter(o=>o.overlap>0).sort((a,b)=>b.overlap-a.overlap||b.essentialOverlap-a.essentialOverlap||a.name.localeCompare(b.name)).slice(0,max);
}
export function createStrategies({title,roles=[],terms=[],extras=[]}){
  const unique=a=>[...new Set(a.map(x=>String(x).trim()).filter(Boolean))];
  const base=title==='Untitled role'?[]:[title];
  const r=unique([...base,...roles.map(x=>typeof x==='string'?x:x.name)]).slice(0,8);
  const s=unique([...terms,...extras]).slice(0,10);
  const or=g=>g.length?'('+g.map(safePhrase).join(' OR ')+')':'';
  const and=parts=>parts.filter(Boolean).join(' AND ');
  const precise=and([or(r.slice(0,1)),...s.slice(0,3).map(x=>or([x]))]);
  const balanced=and([or(r.slice(0,5)),or(s.slice(0,Math.max(2,Math.min(3,s.length))))]);
  const exploratory=and([or(r),or(s.slice(0,Math.max(2,Math.min(5,s.length))))]);
  return [
    {id:'precise',name:'Precise',sub:'Exact title and required terms',query:precise,roleCount:Math.min(1,r.length),skillCount:Math.min(3,s.length),approach:'Narrow: review hard requirements first'},
    {id:'balanced',name:'Balanced',sub:'Related titles and a skills group',query:balanced,roleCount:Math.min(5,r.length),skillCount:Math.min(3,s.length),approach:'Explore adjacent titles; confirm relevance'},
    {id:'explore',name:'Explore',sub:'More title and skill alternatives',query:exploratory,roleCount:r.length,skillCount:Math.min(5,s.length),approach:'Broad discovery; expect less precision'}
  ];
}
// Small strict Boolean grammar; used by syntax checking and transparent taxonomy tests.
function tokenize(q){
  const tokens=[];let i=0;
  while(i<q.length){
    if(/\s/.test(q[i])){i++;continue;}
    if(q[i]==='('||q[i]===')'){tokens.push({kind:q[i],value:q[i++]});continue;}
    if(q[i]==='"'){
      const start=++i;while(i<q.length&&q[i]!=='"')i++;
      if(i>=q.length||i===start)throw Error('Unclosed or empty quoted phrase.');
      tokens.push({kind:'term',value:q.slice(start,i++)});continue;
    }
    const start=i;while(i<q.length&&!/\s|[()"]/.test(q[i]))i++;
    if(i===start)throw Error('Unexpected quotation mark.');
    const word=q.slice(start,i);const op=word.toUpperCase();
    tokens.push({kind:['AND','OR','NOT'].includes(op)?op:'term',value:word});
  }
  return tokens;
}
export function parseBoolean(query){
  const q=String(query||'').trim();
  if(!q)throw Error('Add a title or skill to build a query.');
  if(q.length>2000)throw Error('Reduce your search to fewer than 2,000 characters.');
  const tokens=tokenize(q);let pos=0;
  const peek=()=>tokens[pos]?.kind;
  const take=kind=>{if(peek()!==kind)throw Error(`Expected ${kind} in search expression.`);return tokens[pos++];};
  function primary(){
    if(peek()==='NOT'){take('NOT');return {op:'NOT',child:primary()};}
    if(peek()==='('){take('(');const x=or();take(')');return x;}
    if(peek()==='term')return {op:'TERM',value:take('term').value};
    throw Error('Expected a search term or group.');
  }
  function and(){let node=primary();while(peek()==='AND'){take('AND');node={op:'AND',left:node,right:primary()};}return node;}
  function or(){let node=and();while(peek()==='OR'){take('OR');node={op:'OR',left:node,right:and()};}return node;}
  const ast=or();if(pos!==tokens.length)throw Error('Missing operator or unmatched parenthesis.');return ast;
}
export function validateBoolean(query){
  try{parseBoolean(query);return {valid:true,message:'Syntax looks good. Validate it on your sourcing platform.'};}
  catch(e){return {valid:false,message:e.message};}
}
export function queryMatches(ast,fields){
  if(ast.op==='TERM'){
    const term=clean(ast.value);
    const escaped=term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const phrase=new RegExp('(^|[^a-z0-9])'+escaped+'(?=$|[^a-z0-9])','i');
    return fields.some(f=>phrase.test(clean(f)));
  }
  if(ast.op==='NOT')return !queryMatches(ast.child,fields);
  if(ast.op==='AND')return queryMatches(ast.left,fields)&&queryMatches(ast.right,fields);
  return queryMatches(ast.left,fields)||queryMatches(ast.right,fields);
}
export function taxonomyTest(catalog,query){
  if(!catalog?.occupations?.length||!catalog?.skills?.length)return {available:false,reason:'ESCO data is not available.'};
  let ast;try{ast=parseBoolean(query);}catch(e){return {available:false,reason:e.message};}
  const names=new Map(catalog.skills.map(s=>[s.id,s.name]));
  const matching=[];
  for(const occupation of catalog.occupations){
    const fields=[occupation.name,...(occupation.skills||[]).map(s=>names.get(s.id)).filter(Boolean)];
    if(queryMatches(ast,fields))matching.push(occupation.name);
  }
  return {available:true,matched:matching.length,total:catalog.occupations.length,examples:matching.slice(0,3),
    note:'Matches in this published ESCO occupation subset, not people, candidates, or real search results.'};
}
export function outreachDraft({title,terms=[]}={}){
  const role=title&&title!=='Untitled role'?title:'the open role';
  const skills=terms.filter(Boolean).slice(0,2);
  const angle=skills.length?`The role involves ${skills.join(' and ')}. `:'';
  return `Hi [First name],\n\nI'm reaching out about a ${role} opportunity. ${angle}Your background in [verified, relevant experience] caught my attention.\n\nWould you be open to a short conversation to see whether the role could be a fit? I'm happy to share more details first.\n\nBest,\n[Recruiter's name]`;
}
export function dossier({title,jd,requirements=[],roles=[],strategies=[],selected=[],notes='',source,outreach=''}){
  const now=new Date().toISOString().slice(0,10), ids=new Set(selected);
  return [`# ScoutForge — sourcing strategy`, `Generated: ${now}`, `Role: ${title||'Untitled role'}`,`ESCO: ${source?.version||'not loaded'} (${source?.source||'unavailable'})`,
    'Status: recruiter review required; no candidate sourcing or outreach has been executed.','',
    '## Reviewed search concepts',...requirements.filter(x=>ids.has(x.id)).map(r=>`- **${r.name}** (${r.type}): “${r.evidence}”`),
    requirements.filter(x=>ids.has(x.id)).length?'':'No ESCO concepts approved.',
    '','## Related occupations (taxonomy only)',...roles.map(r=>`- ${r.name} — ${r.overlap} linked concept(s)`),roles.length?'':'No related occupations found.',
    '','## Search queries',...strategies.map(s=>`### ${s.name}\n\`\`\`\n${s.query||'Not available'}\n\`\`\`\n${validateBoolean(s.query).message}`),
    '','## Outreach draft (review before sending)',outreach||'Not prepared',
    '','## Recruiter notes',notes||'None',
    '','## Evidence and limitations','ESCO relationships help explore search terms; they do not indicate candidate suitability or availability.',
    'Search strategies have not been tested on LinkedIn Recruiter or a candidate database.',
    'Job text is processed locally in the browser; the public demo stores no candidate records.',
    `ESCO source: ${ESCO_SOURCE}`,'','## Original job description',jd||'Not supplied'].join('\n');
}
export function download(name,text,type='text/plain'){
  const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}