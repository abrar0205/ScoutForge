"""Desktop/mobile Chromium integration with actual served ESM modules.
The HTTP route supplies a labeled test fixture; production site data is untouched.
"""
from playwright.sync_api import sync_playwright
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from functools import partial
from pathlib import Path
import json, os, re

root=Path(__file__).resolve().parent.parent/'web'
FIXTURE={'source':'European Commission ESCO','version':'TEST FIXTURE','retrieved_at':'2026-01-01T00:00:00Z','counts':{'occupations':3,'skills':3,'relations':4},
 'skills':[{'id':'s1','name':'quality control','alt':''},{'id':'s2','name':'maintain electrical equipment','alt':''},{'id':'s3','name':'program industrial robots','alt':''}],
 'occupations':[{'id':'o1','name':'industrial automation technician','isco':'3113','skills':[{'id':'s2','type':'essential'},{'id':'s3','type':'optional'}]},
 {'id':'o2','name':'industrial engineer','isco':'2141','skills':[{'id':'s1','type':'essential'}]},
 {'id':'o3','name':'industrial robotics engineer','isco':'2142','skills':[{'id':'s3','type':'essential'}]}]}
class QuietHandler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(root)))
worker=Thread(target=server.serve_forever,daemon=True);worker.start()
try:
 with sync_playwright() as pw:
  opts={'headless':True}
  if os.environ.get('SCOUTFORGE_CHROMIUM'):opts['executable_path']=os.environ['SCOUTFORGE_CHROMIUM'];opts['args']=['--no-sandbox']
  browser=pw.chromium.launch(**opts)
  try:
   for width,height in [(1440,1000),(390,844)]:
    page=browser.new_page(viewport={'width':width,'height':height},accept_downloads=True)
    errors=[];page.on('pageerror',lambda err: errors.append(str(err)))
    if os.environ.get('SCOUTFORGE_REAL_MODULES'):
     # GitHub Actions runner can serve localhost and test native ESM imports.
     page.route('**/data/esco.json',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps(FIXTURE)))
     page.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='networkidle',timeout=30000)
    else:
     # Restricted local Chromium sandbox blocks all HTTP, including localhost.
     # Inline equivalent is used only for local visual checks.
     html=(root/'index.html').read_text(encoding='utf8')
     html=html.replace('<link rel="stylesheet" href="styles.css"/>','<style>'+(root/'styles.css').read_text(encoding='utf8')+'</style>')
     engine=(root/'engine.js').read_text(encoding='utf8').replace('export ','')
     app=(root/'app.js').read_text(encoding='utf8').split('\n',1)[1]
     html=html.replace('<script type="module" src="app.js"></script>',
         '<script>window.fetch=async()=>({ok:true,json:async()=>('+json.dumps(FIXTURE)+')});</script><script type="module">'+engine+'\n'+app+'</script>')
     html=re.sub(r'<link[^>]*fonts.googleapis[^>]*>', '',html)
     html=re.sub(r'<link[^>]*fonts.gstatic[^>]*>', '',html)
     page.set_content(html,wait_until='domcontentloaded')
    page.wait_for_function("document.getElementById('data-status').textContent.includes('TEST FIXTURE')")
    assert page.get_by_role('tab').count()==3
    page.locator('#example').click()
    assert page.locator('#match-count').inner_text()!='0 matched'
    assert page.locator('.requirement').count()>=2
    page.get_by_role('tab',name='02 Build search').click()
    assert page.locator('#strategy-picks button').count()==3
    assert page.locator('#query-validation.invalid').count()==0
    assert page.locator('#metric-coverage').inner_text()!='—'
    page.locator('#related-details summary').click()
    page.locator('#graph svg').wait_for(timeout=10000)
    assert page.locator('.occupation-item').count()>0
    page.locator('#query-input').fill('"PLC" AND')
    assert 'invalid' in page.locator('#query-validation').get_attribute('class')
    assert page.locator('#copy-query').is_disabled()
    page.locator('#reset-query').click()
    assert not page.locator('#copy-query').is_disabled()
    page.get_by_role('tab',name='03 Export plan').click()
    assert page.locator('.preview-title').count()==1
    assert '[First name]' in page.locator('#outreach-draft').input_value()
    with page.expect_download(timeout=10000) as info:page.locator('#export-md').click()
    assert info.value.suggested_filename.endswith('.md')
    with page.expect_download(timeout=10000) as info2:page.locator('#export-csv').click()
    assert info2.value.suggested_filename.endswith('.csv')
    assert not errors,errors
    assert page.evaluate('document.documentElement.scrollWidth')<=width+1,f'horizontal overflow @{width}'
    if os.environ.get('SCOUTFORGE_SCREENSHOTS'):
     page.screenshot(path=f'/mnt/data/scoutforge-{width}-v02.png',full_page=True)
    print(f'PASS served ESM integration @{width}: evidence, 3 strategies, taxonomy, edits, exports')
    page.close()
  finally:browser.close()
finally:server.shutdown();server.server_close()