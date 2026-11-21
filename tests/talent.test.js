import test from 'node:test';import assert from 'node:assert/strict';
import {cleanTerms,searchProfiles,relatedSkills,hypotheticalProfile,validateCatalog,parseProfileCsv,exportQueue,funnelSummary} from '../web/talent.js';
const profiles=[
 {id:'SF-001',title:'Automation engineer',family:'Manufacturing',location:'Berlin',skills:['PLC','Python','Siemens S7'],source:'synthetic_esco'},
 {id:'SF-002',title:'Data engineer',family:'Data',location:'Munich',skills:['SQL','Python'],source:'synthetic_esco'},
 {id:'SF-003',title:'Recruitment specialist',family:'Talent',location:'Berlin',skills:['Boolean search','Excel'],source:'synthetic_esco'},
];
test('skill search works for Python without guessed candidate count',()=>{const x=searchProfiles(profiles,{query:'Python'});assert.equal(x.total,2);assert.equal(x.items.length,2);});
test('OR between skill terms works; region filtering works',()=>{assert.equal(searchProfiles(profiles,{query:'Python, SQL'}).total,2);assert.equal(searchProfiles(profiles,{query:'Python',region:'Berlin'}).total,1);});
test('unknown skill gives explicit zero records; user may opt into fictional what-if',()=>{assert.equal(searchProfiles(profiles,{query:'Quantum Flux'}).total,0);const p=hypotheticalProfile('Quantum Flux',{role:'Quality engineer'});assert.deepEqual(p.skills,['Quantum Flux']);assert.equal(p.source,'hypothetical');});
test('hypothetical IDs are stable',()=>assert.equal(hypotheticalProfile('Novel Skill').id,hypotheticalProfile('Novel Skill').id));
test('catalog requires labeled fictional entries',()=>{assert.equal(validateCatalog({kind:'synthetic_talent_sandbox',profiles}).profiles.length,3);assert.throws(()=>validateCatalog({kind:'real_people',profiles}));});
test('related terms are contextual instead of fabricated profiles',()=>{const x=relatedSkills(profiles,'Python');assert(x.some(item=>item.skill==='SQL'));});
test('CSV with quoted commas and embedded quotes imports correctly',()=>{const raw='id,title,skills,region\nP1,"Data, automation engineer","Python|SQL","Berlin"\n';const rows=parseProfileCsv(raw);assert.equal(rows.length,1);assert.equal(rows[0].title,'Data, automation engineer');assert.deepEqual(rows[0].skills,['Python','SQL']);});
test('personal information columns are rejected',()=>assert.throws(()=>parseProfileCsv('id,name,title,skills,region\n1,Jane,Engineer,Python,Berlin'),/Remove personal fields/));
test('CSV formula injection is escaped on export',()=>{const csv=exportQueue([{id:'SF-001',stage:'Research',note:'=SUM(1,1)'}],profiles);assert(csv.includes("'=SUM"));});
test('queue totals record only user changes',()=>{const result=funnelSummary([{id:'SF-001',stage:'Research'},{id:'SF-002',stage:'Draft ready'}]);assert.equal(result.total,2);assert.equal(result.counts['Contacted (simulated)'],0);});