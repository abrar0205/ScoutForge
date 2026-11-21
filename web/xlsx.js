/* Tiny dependency-free XLSX writer. ZIP STORE + OOXML inline text cells.
   No network access; only fictional sandbox IDs are exported. All values are serialized as strings,
   so untrusted input never becomes an Excel formula. */
const utf=new TextEncoder();
const xml=s=>String(s??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const colName=n=>{let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
function sheetXml(rows, widths){
 const columns=widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('');
 const content=rows.map((row,ri)=>`<row r="${ri+1}"${ri===0?' ht="29" customHeight="1"':''}>`+row.map((value,ci)=>{
   const val=xml(String(value??'').slice(0,32767));const address=colName(ci)+(ri+1);
   return `<c r="${address}" t="inlineStr"${ri===0?' s="1"':''}><is><t xml:space="preserve">${val}</t></is></c>`;
 }).join('')+'</row>').join('');
 const total=rows[0]?.length||1;const ref=`A1:${colName(total-1)}${rows.length}`;
 return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="${ref}"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>${columns}</cols><sheetData>${content}</sheetData><autoFilter ref="${ref}"/></worksheet>`;
}
const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Aptos"/><color rgb="FF17233A"/></font><font><b/><sz val="11"/><name val="Aptos"/><color rgb="FFFFFFFF"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF4256DC"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`;
const u16=(v)=>[v&255,(v>>8)&255],u32=v=>[v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255];
const crcTable=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);crcTable[n]=c>>>0;}
function crc32(bytes){let crc=0xffffffff;for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
function zip(entries){const local=[],central=[];let offset=0;
 for(const [name,text] of entries){const nameBytes=utf.encode(name),bytes=utf.encode(text),crc=crc32(bytes);
  const head=Uint8Array.from([...u32(0x04034b50),...u16(20),...u16(0x800),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(bytes.length),...u32(bytes.length),...u16(nameBytes.length),...u16(0)]);
  local.push(head,nameBytes,bytes);
  central.push(Uint8Array.from([...u32(0x02014b50),...u16(20),...u16(20),...u16(0x800),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(bytes.length),...u32(bytes.length),...u16(nameBytes.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset)]),nameBytes);
  offset+=head.length+nameBytes.length+bytes.length;
 }
 const centralBytes=central.reduce((sum,c)=>sum+c.length,0);
 const end=Uint8Array.from([...u32(0x06054b50),...u16(0),...u16(0),...u16(entries.length),...u16(entries.length),...u32(centralBytes),...u32(offset),...u16(0)]);
 const items=[...local,...central,end],output=new Uint8Array(items.reduce((n,x)=>n+x.length,0));let start=0;for(const item of items){output.set(item,start);start+=item.length;}return output;
}
export function buildWorkbook({title,terms=[],strategies=[],notes='',source,queue=[],profiles=[]}={}){
 const now=new Date().toISOString().slice(0,10);
 const sheets=[
  {name:'Plan overview',widths:[25,88],rows:[['Field','Detail'],['Role',title||'Skill-led search'],['Prepared',now],['Review status','Draft — recruiter review required'],['Approved search terms',terms.map(t=>t.name).join(', ')],['Source','ESCO '+(source?.version||'not loaded')+' + exact terms from job description'],['Notes',notes],['Data limitation','Searchable fictional profile library exists for demonstration. No real contactable candidates, verified availability or actual outreach results.'],['Usage','Copy the Boolean strings into your authorized sourcing platform and validate there']]},
  {name:'Search strategies',widths:[18,100,68,24],rows:[['Approach','Boolean query','Guidance','Status'],...strategies.map(s=>[s.name,s.query,s.approach,'Draft / validate'])]},
  {name:'Reviewed terms',widths:[35,22,90],rows:[['Search term','Evidence origin','Evidence in JD'],...terms.map(t=>[t.name,t.provenance==='esco'?'ESCO concept':t.provenance==='manual'?'Recruiter added':'Exact term in JD',t.evidence||'Recruiter entered'])]},
  {name:'Activity tracker',widths:[19,22,25,42,18,19,19,70],rows:[['Date','Role','Channel','Search variant','Profiles reviewed','Messages sent','Responses','Learning / next action'],...Array.from({length:18},()=>['','','','','','','',''])]},
  {name:'Fictional demo queue',widths:[22,52,28,30,35],rows:[['Fictional profile ID','Sample occupation','Illustrative region','Demo stage','Source / limitation'],...queue.map(row=>{const p=profiles.find(p=>p.id===row.id);return [row.id,p?.title||row.title||'',p?.location||'',row.stage||'Research','SIMULATED ONLY; no person contacted'];})]}
 ];
 const fileTypes=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
 const rels=`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
 const book=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s,i)=>`<sheet name="${xml(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`;
 const br=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
 return zip([['[Content_Types].xml',fileTypes],['_rels/.rels',rels],['xl/workbook.xml',book],['xl/_rels/workbook.xml.rels',br],['xl/styles.xml',styles],...sheets.map((s,i)=>[`xl/worksheets/sheet${i+1}.xml`,sheetXml(s.rows,s.widths)])]);
}
export function downloadWorkbook(payload){const bytes=buildWorkbook(payload);const file=new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});const url=URL.createObjectURL(file);const link=document.createElement('a');link.href=url;link.download='ScoutForge-sourcing-plan.xlsx';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}