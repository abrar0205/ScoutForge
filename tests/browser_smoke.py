"""Real ESM browser regression, desktop and mobile; source data is a TEST FIXTURE.
Do not use any fake applicant data, only fabricated role/skill taxonomy fixtures in QA.
"""
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from functools import partial
from playwright.sync_api import sync_playwright
from zipfile import ZipFile
from xml.etree import ElementTree as ET
import json, os, re
ROOT=Path(__file__).resolve().parent.parent/'web'
FIXTURE={'source':'European Commission ESCO','version':'TEST FIXTURE','retrieved_at':'2026-01-01T00:00:00Z','counts':{'occupations':3,'skills':3,'relations':4},'skills':[{'id':'s1','name':'quality control','alt':''},{'id':'s2','name':'maintain electrical equipment','alt':''},{'id':'s3','name':'program industrial robots','alt':''}],'occupations':[{'id':'o1','name':'industrial automation technician','isco':'3113','skills':[{'id':'s2','type':'essential'},{'id':'s3','type':'optional'}]},{'id':'o2','name':'industrial engineer','isco':'2141','skills':[{'id':'s1','type':'essential'}]},{'id':'o3','name':'industrial robotics engineer','isco':'2142','skills':[{'id':'s3','type':'essential'}]}]}
class QuietHandler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT)))
Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as playwright:
  options={'headless':True}
  if os.environ.get('SCOUTFORGE_CHROMIUM'):
   options['executable_path']=os.environ['SCOUTFORGE_CHROMIUM'];options['args']=['--no-sandbox']
  browser=playwright.chromium.launch(**options)
  try:
   for width,height in [(1440,1000),(390,844)]:
    page=browser.new_page(viewport={'width':width,'height':height},accept_downloads=True)
    failures=[];page.on('pageerror',lambda error:failures.append(str(error)))
    if os.environ.get('SCOUTFORGE_REAL_MODULES'):
     page.route('**/data/esco.json',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps(FIXTURE)))
     page.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='networkidle',timeout=30000)
    else:
     html=(ROOT/'index.html').read_text(encoding='utf8');css=(ROOT/'styles.css').read_text(encoding='utf8')
     html=html.replace('<link rel="stylesheet" href="styles.css"/>','<style>'+css+'</style>')
     engine=(ROOT/'engine.js').read_text(encoding='utf8').replace('export ','')
     xlsx=(ROOT/'xlsx.js').read_text(encoding='utf8').replace('export ','')
     app='\n'.join((ROOT/'app.js').read_text(encoding='utf8').splitlines()[2:])
     html=html.replace('<script type="module" src="app.js"></script>','<script>window.fetch=async()=>({ok:true,json:async()=>('+json.dumps(FIXTURE)+')});</script><script type="module">'+engine+'\n'+xlsx+'\n'+app+'</script>')
     html=re.sub(r'<link[^>]*fonts.googleapis[^>]*>', '',html)
     html=re.sub(r'<link[^>]*fonts.gstatic[^>]*>', '',html)
     page.set_content(html,wait_until='domcontentloaded',timeout=20000)
    page.wait_for_function("document.querySelector('#data-status').textContent.includes('ready')",timeout=25000)
    # Exact screenshot repro: title supplied, description only 'python' - must NOT be empty.
    page.locator('#job-description').fill('python')
    page.locator('.optional-input summary').click()
    page.locator('#role-title').fill('Industrial Automation Engineer')
    page.locator('#analyze').click()
    assert page.locator('#results').is_visible()
    assert page.locator('.term-pill').count()>=1
    assert 'Python' in page.locator('#terms-list').inner_text()
    assert page.locator('#query-validation.invalid').count()==0
    assert 'Python' in page.locator('#query-input').input_value()
    assert page.locator('#copy-query').is_enabled()
    # Changing input invalidates previous exports until the plan is refreshed.
    page.locator('#job-description').fill('python and SQL')
    assert page.locator('#export-xlsx').is_disabled()
    assert page.locator('#result-updated').is_visible()
    page.locator('#analyze').click()
    assert 'SQL' in page.locator('#terms-list').inner_text()
    assert page.locator('#export-xlsx').is_enabled()
    # Full workflow with vocabulary, optional ESCO detail and exports.
    page.locator('#example').click()
    assert page.locator('#strategy-picks button').count()==3
    assert page.locator('.term-pill').count()>=3
    page.locator('#strategy-picks button').nth(2).click()
    assert 'OR' in page.locator('#query-input').input_value()
    page.locator('#query-input').fill('"PLC" AND')
    assert page.locator('#copy-query').is_disabled()
    page.locator('#reset-query').click()
    assert page.locator('#copy-query').is_enabled()
    page.locator('#skill-input').fill('Hydraulics')
    page.locator('#add-skill').click()
    assert 'Hydraulics' in page.locator('#terms-list').inner_text()
    assert 'Hydraulics' in page.locator('#query-input').input_value()
    page.locator('#evidence-details summary').click()
    assert 'Exact JD keyword' in page.locator('#evidence-list').inner_text()
    page.locator('#related-details summary').click()
    page.locator('#graph svg').wait_for(timeout=15000)
    assert page.locator('.occupation-item').count()>=1
    with page.expect_download(timeout=12000) as download:page.locator('#export-md').click()
    assert download.value.suggested_filename.endswith('.md')
    with page.expect_download(timeout=12000) as download:page.locator('#export-xlsx').click()
    assert download.value.suggested_filename.endswith('.xlsx')
    book_path=Path(download.value.path())
    with ZipFile(book_path) as z:
     assert z.testzip() is None
     assert len([x for x in z.namelist() if x.startswith('xl/worksheets/')])==4
     ET.fromstring(z.read('xl/workbook.xml'))
     assert b'Hydraulics' in z.read('xl/worksheets/sheet3.xml')
    page.locator('#outreach-details summary').click()
    assert '[First name]' in page.locator('#outreach-draft').input_value()
    assert not failures,failures
    assert page.evaluate('document.documentElement.scrollWidth')<=width+1,f'Horizontal overflow at {width}'
    if os.environ.get('SCOUTFORGE_SCREENSHOTS'):
     page.screenshot(path=f'/mnt/data/scoutforge-{width}-v03.png',full_page=True)
    print(f'PASS ScoutForge v0.3 @{width}: screenshot repro, editable search, skill library, ESCO links, Excel export')
    page.close()
  finally:browser.close()
finally:server.shutdown();server.server_close()