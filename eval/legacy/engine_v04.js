/* ScoutForge sourcing engine: explainable text evidence, never candidate scoring. */
export const ESCO_SOURCE='https://esco.ec.europa.eu/en/use-esco/download';
const normalize=s=>String(s??'').normalize('NFKC').toLowerCase().replace(/[–—]/g,'-').replace(/\s+/g,' ').trim();
export const short=(s,n=100)=>String(s??'').length>n?String(s).slice(0,n-1)+'…':String(s??'');
export const words=s=>normalize(s).match(/[a-z0-9+#.\-]+/g)||[];
export const safePhrase=s=>'"'+String(s||'').replace(/["\\]/g,' ').replace(/\s+/g,' ').trim().slice(0,110)+'"';
export const cleanUserTerms=value=>[...new Set(String(value||'').split(/[,;\n]/).map(s=>s.trim()).filter(s=>s.length>=2&&s.length<=90))].slice(0,24);

/* Transparent editorial vocabulary, NOT ESCO concepts or model output. A term is suggested
   only when its literal name or a documented alias appears in the supplied text. */
export const GLOSSARY=[
 ['Python','python','python3'],['SQL','sql'],['Excel','microsoft excel','excel'],['Power BI','power bi','powerbi'],
 ['Power Automate','power automate'],['Power Apps','power apps','powerapps'],['VBA','vba'],['Macros','macros','macro'],
 ['JavaScript','javascript','js'],['TypeScript','typescript'],['React','react.js','reactjs'],['Node.js','node.js','nodejs'],
 ['FastAPI','fastapi'],['PostgreSQL','postgresql','postgres'],['Snowflake','snowflake'],['Databricks','databricks'],
 ['Microsoft Fabric','microsoft fabric','fabric sql'],['AWS','aws','amazon web services'],['Azure','azure'],
 ['Docker','docker'],['Kubernetes','kubernetes','k8s'],['Git','git'],['GitHub Actions','github actions'],
 ['ETL','etl'],['Data engineering','data engineering'],['Data analysis','data analysis','data analytics'],
 ['Data visualization','data visualization','data visualisation'],['Dashboarding','dashboards','dashboarding'],
 ['Machine learning','machine learning'],['Deep learning','deep learning'],['Generative AI','generative ai','genai'],
 ['LLM','llm','large language models','large language model'],['Prompt engineering','prompt engineering','prompt design'],
 ['Retrieval-augmented generation','rag','retrieval-augmented generation'],['Natural language processing','nlp','natural language processing'],
 ['API development','api development','rest api','restful api'],['CI/CD','ci/cd'],['Automation','automation'],
 ['PLC','plc','plcs','programmable logic controller','programmable logic controllers'],['SCADA','scada'],
 ['HMI','hmi','human machine interface'],['Siemens S7','siemens s7','s7-1500','s7-1200'],
 ['TIA Portal','tia portal'],['Industrial automation','industrial automation'],['Robotics','robotics'],
 ['CNC','cnc'],['CAD','cad'],['SolidWorks','solidworks'],['MATLAB','matlab'],['Simulink','simulink'],
 ['C++','c++'],['C#','c#'],['Java','java'],['Linux','linux'],['Embedded systems','embedded systems'],
 ['Quality assurance','quality assurance'],['Quality control','quality control'],['Lean manufacturing','lean manufacturing'],
 ['Six Sigma','six sigma'],['SAP','sap'],['ERP','erp'],['Supply chain','supply chain'],['Logistics','logistics'],
 ['Workforce planning','workforce planning'],['Talent acquisition','talent acquisition'],['Active sourcing','active sourcing'],
 ['Boolean search','boolean search','boolean strings'],['LinkedIn Recruiter','linkedin recruiter'],
 ['Talent mapping','talent mapping','talent maps'],['Candidate screening','candidate screening','screening calls'],
 ['Applicant tracking system','applicant tracking system','ats'],['Recruiting','recruitment','recruiting'],
 ['Outreach','outreach'],['HR analytics','hr analytics','people analytics'],['Pivot tables','pivot tables','pivot table'],
 ['Power Query','power query'],['Tableau','tableau'],['Alteryx','alteryx'],['SharePoint','sharepoint'],
 ['Zapier','zapier'],['Make.com','make.com'],['Green skills','green skills'],
 ['Sustainability','sustainability'],['Technical documentation','technical documentation']
].map(([name,...aliases])=>({name,aliases:[...new Set([name,...aliases])]}));
const escRe=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function termInText(text,term){
 const cleaned=normalize(text);const token=normalize(term);if(!token||token.length<2)return false;
 // Require boundaries: "SQL" does not match "NoSQL"; "R" cannot match arbitrary prose.
 const regex=new RegExp('(^|[^a-z0-9])'+escRe(token)+'(?=$|[^a-z0-9])','i');
 if(regex.test(cleaned))return true;
 // Bounded morphology: "programming robots" can match "program robots".
 const needle=words(token),hay=words(text);
 if(needle.length<2)return false;
 const stem=x=>x.endsWith('ing')&&x.length>=7?x.slice(0,-3).replace(/(.)\1$/,'$1'):x;
 return hay.some((_,i)=>i+needle.length<=hay.length&&needle.every((w,j)=>w===hay[i+j]||(j===0&&stem(w)===stem(hay[i+j]))));
}
const fragments=jd=>String(jd||'').split(/\n|(?<=[.!?])\s+(?=[A-Z])/).map(s=>s.replace(/^[-*\d.)\s]+/,'').trim()).filter(Boolean).slice(0,200);
const aliases=alt=>String(alt||'').split(/\r|\n|\|/).map(s=>s.trim()).filter(s=>s.length>2&&s.length<=90).slice(0,10);
export function extractTitle(jd){
 const first=fragments(jd)[0]||'';
 if(!first||first.length>85||/^(about|what |who |our |responsib|qualific|company|mission|we |experience |looking |must |preferred)/i.test(first))return 'Untitled role';
 if(first.split(' ').length>9)return 'Untitled role';
 if(words(first).length===1&&!/^(recruiter|designer|technician|engineer|developer|analyst|machinist|electrician|operator|manager)$/i.test(first))return 'Untitled role';
 return first.replace(/^(job title|role|position):\s*/i,'').slice(0,80)||'Untitled role';
}
const preferred=s=>/\b(preferred|nice to have|bonus|ideally|desirable|advantage|optional)\b/i.test(s)?'preferred':'review';
export function extractRequirements(jd,catalog){
 if(!String(jd||'').trim())return [];
 const lines=fragments(jd),hits=[],matchedAliases=new Set();
 // ESCO evidence comes exclusively from published ESCO concepts with a literal match.
 for(const skill of catalog?.skills||[]){
   const terms=[skill.name,...aliases(skill.alt)];
   const sentence=lines.find(s=>terms.some(t=>termInText(s,t)));
   if(!sentence)continue;
   const alias=terms.find(t=>termInText(sentence,t));
   hits.push({id:skill.id,name:skill.name,matched:alias,evidence:short(sentence,320),type:preferred(sentence),provenance:'esco',source:ESCO_SOURCE});
   matchedAliases.add(normalize(alias));matchedAliases.add(normalize(skill.name));
 }
 // Exact evidence-backed technology/domain terms, clearly NOT identified as ESCO.
 for(const entry of GLOSSARY){
   if(matchedAliases.has(normalize(entry.name)))continue;
   const sentence=lines.find(s=>entry.aliases.some(a=>termInText(s,a)));
   if(!sentence)continue;
   const match=entry.aliases.find(a=>termInText(sentence,a));
   if(matchedAliases.has(normalize(match)))continue;
   hits.push({id:'term:'+entry.name.toLowerCase().replace(/[^a-z0-9]+/g,'-'),name:entry.name,matched:match,evidence:short(sentence,320),type:preferred(sentence),provenance:'jd',source:'Job description'});
   matchedAliases.add(normalize(match));
 }
 // When users start with a single skill, don't leave them stranded. Reflect the exact
 // input back as a REVIEWABLE keyword; never claim semantic AI or ESCO identification.
 const trimmed=String(jd).trim();
 if(!hits.length&&words(trimmed).length<=3&&trimmed.length<=65&&/[a-z]{2,}/i.test(trimmed)){
   const phrase=trimmed.replace(/\n/g,' ').replace(/[^\p{L}\p{N}+#.\/\- ]/gu,'').trim();
   if(phrase.length>=2)hits.push({id:'input:'+normalize(phrase),name:phrase,evidence:trimmed,matched:trimmed,type:'review',provenance:'jd',source:'Job description'});
 }
 const order={esco:0,jd:1};
 return hits.sort((a,b)=>order[a.provenance]-order[b.provenance]||b.matched.length-a.matched.length||a.name.localeCompare(b.name)).slice(0,40);
}
export function occupationsForSkills(catalog,selectedIds,max=9){
 if(!catalog?.occupations)return [];
 const ids=new Set(selectedIds);if(!ids.size)return [];
 return catalog.occupations.map(o=>{const matched=(o.skills||[]).filter(l=>ids.has(l.id));return {...o,matched,overlap:matched.length,essentialOverlap:matched.filter(x=>x.type==='essential').length};})
  .filter(o=>o.overlap>0).sort((a,b)=>b.overlap-a.overlap||b.essentialOverlap-a.essentialOverlap||a.name.localeCompare(b.name)).slice(0,max);
}
export function createStrategies({title,roles=[],terms=[],extras=[]}={}){
 const unique=a=>[...new Map(a.map(x=>String(x||'').trim()).filter(Boolean).map(x=>[normalize(x),x])).values()];
 const titles=unique([title==='Untitled role'?'':title,...roles.map(x=>typeof x==='string'?x:x.name)]).slice(0,7);
 const skills=unique([...terms,...extras]).slice(0,12);
 const group=xs=>xs.length?'('+xs.map(safePhrase).join(' OR ')+')':'';
 const join=xs=>xs.filter(Boolean).join(' AND ');
 const precise=join([titles.length?safePhrase(titles[0]):'',...skills.slice(0,3).map(safePhrase)]);
 const balanced=join([group(titles.slice(0,4)),group(skills.slice(0,5))]);
 const explore=group([...titles,...skills].slice(0,12));
 return [
  {id:'balanced',name:'Balanced',sub:'Titles plus any of your chosen skills',approach:'Useful starting point; check it on your sourcing platform.',query:balanced,roleCount:Math.min(4,titles.length),skillCount:Math.min(5,skills.length)},
  {id:'precise',name:'Focused',sub:'Exact title and individual required skills',approach:'May be restrictive; relax requirements if needed.',query:precise,roleCount:Math.min(1,titles.length),skillCount:Math.min(3,skills.length)},
  {id:'explore',name:'Broad',sub:'Find role-title or skill alternatives',approach:'Exploratory search; expect more irrelevant results.',query:explore,roleCount:titles.length,skillCount:skills.length}
 ];
}
function tokenize(q){
 const tokens=[];let i=0;while(i<q.length){if(/\s/.test(q[i])){i++;continue;}
  if('()'.includes(q[i])){tokens.push({kind:q[i],value:q[i++]});continue;}
  if(q[i]==='"'){const start=++i;while(i<q.length&&q[i]!=='"')i++;if(i>=q.length||i===start)throw Error('Unclosed or empty quoted phrase.');tokens.push({kind:'term',value:q.slice(start,i++)});continue;}
  const start=i;while(i<q.length&&!/\s|[()"]/.test(q[i]))i++;if(i===start)throw Error('Unexpected quotation mark.');const word=q.slice(start,i);const op=word.toUpperCase();tokens.push({kind:['AND','OR','NOT'].includes(op)?op:'term',value:word});
 }return tokens;
}
export function parseBoolean(query){
 const q=String(query||'').trim();if(!q)throw Error('Add a role or skill to build a search.');if(q.length>2000)throw Error('Reduce your search to fewer than 2,000 characters.');
 const tokens=tokenize(q);let pos=0;const peek=()=>tokens[pos]?.kind;const take=k=>{if(peek()!==k)throw Error(`Expected ${k} in search expression.`);return tokens[pos++];};
 function primary(){if(peek()==='NOT'){take('NOT');return {op:'NOT',child:primary()};}if(peek()==='('){take('(');const x=or();take(')');return x;}if(peek()==='term')return {op:'TERM',value:take('term').value};throw Error('Expected a search term or group.');}
 function and(){let x=primary();while(peek()==='AND'){take('AND');x={op:'AND',left:x,right:primary()};}return x;}
 function or(){let x=and();while(peek()==='OR'){take('OR');x={op:'OR',left:x,right:and()};}return x;}
 const ast=or();if(pos!==tokens.length)throw Error('Missing operator or unmatched parenthesis.');return ast;
}
export function validateBoolean(query){try{parseBoolean(query);return {valid:true,message:'Valid Boolean syntax · verify on your sourcing platform'};}catch(e){return {valid:false,message:e.message};}}
export function queryMatches(ast,fields){
 if(ast.op==='TERM'){const term=normalize(ast.value);const re=new RegExp('(^|[^a-z0-9])'+escRe(term)+'(?=$|[^a-z0-9])','i');return fields.some(s=>re.test(normalize(s)));}
 if(ast.op==='NOT')return !queryMatches(ast.child,fields);if(ast.op==='AND')return queryMatches(ast.left,fields)&&queryMatches(ast.right,fields);return queryMatches(ast.left,fields)||queryMatches(ast.right,fields);
}
export function taxonomyTest(catalog,query){
 if(!catalog?.occupations?.length||!catalog?.skills?.length)return {available:false,reason:'ESCO data is not available.'};
 let ast;try{ast=parseBoolean(query);}catch(e){return {available:false,reason:e.message};}
 const names=new Map(catalog.skills.map(s=>[s.id,s.name]));const matching=[];
 for(const occupation of catalog.occupations){const fields=[occupation.name,...(occupation.skills||[]).map(s=>names.get(s.id)).filter(Boolean)];if(queryMatches(ast,fields))matching.push(occupation.name);}
 return {available:true,matched:matching.length,total:catalog.occupations.length,examples:matching.slice(0,4),note:'Matching ESCO occupation records, not people or available candidates.'};
}
export function outreachDraft({title,terms=[]}={}){
 const role=title&&title!=='Untitled role'?title:'the open position';
 const skills=terms.filter(Boolean).slice(0,2);const angle=skills.length?`The work includes ${skills.join(' and ')}. `:'';
 return `Hi [First name],\n\nI'm reaching out about a ${role} opportunity. ${angle}I noticed [specific, verified aspect of their experience] and thought the role might be relevant.\n\nWould you be open to hearing a few details? Happy to share more first.\n\nBest,\n[Recruiter name]`;
}
export function dossier({title,jd,requirements=[],roles=[],strategies=[],selected=[],notes='',source,outreach=''}={}){
 const ids=new Set(selected);const now=new Date().toISOString().slice(0,10);const included=requirements.filter(r=>ids.has(r.id));
 return [`# Sourcing plan — ${title||'Untitled role'}`,`Prepared ${now} · recruiter review required`, '',
   '## Search terms',...included.map(r=>`- ${r.name} [${r.provenance==='esco'?'ESCO concept':r.provenance==='manual'?'Recruiter-added':'Exact term in job description'}] · “${r.evidence||'Added by recruiter'}”`),...(!included.length?['- None selected']:[]),
   '', '## Boolean searches',...strategies.flatMap(s=>[`### ${s.name}`,s.query||'(Not available)',validateBoolean(s.query).message,'']),
   '## Related ESCO occupations (vocabulary exploration only)',...roles.map(r=>`- ${r.name}: ${r.overlap} shared ESCO concepts`),...(!roles.length?['- No linked occupations identified from selected ESCO concepts.']:[]),
   '', '## Unsent outreach template',outreach||'Not prepared','', '## Recruiter notes',notes||'None','',
   '## Important limitations','- Search terms are suggestions, not verified candidate qualifications.','- The separate talent sandbox contains fictional sample profiles only; no real candidate availability or contact information is provided.','- Boolean grammar differs across platforms; verify syntax and relevance before use.','- Review outreach before sending; no messages are automatically sent.',
   `- ESCO taxonomy reference: ${source?.version||'not loaded'} · ${ESCO_SOURCE}`,'','## Supplied job description',jd||'(Not supplied)'].join('\n');
}
export function download(name,text,type='text/plain'){const u=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500);}