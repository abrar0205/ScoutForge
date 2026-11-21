"""Deterministic Chromium smoke tests; fixture is never published as real ESCO data."""
from playwright.sync_api import sync_playwright
from pathlib import Path
import json
import os
import re

root = Path(__file__).resolve().parent.parent / 'web'
FIXTURE = {
    'source': 'European Commission ESCO', 'version': 'TEST FIXTURE',
    'retrieved_at': '2026-01-01T00:00:00Z',
    'counts': {'occupations': 2, 'skills': 3, 'relations': 3},
    'skills': [
        {'id': 's1', 'name': 'quality control', 'alt': ''},
        {'id': 's2', 'name': 'maintain electrical equipment', 'alt': ''},
        {'id': 's3', 'name': 'program industrial robots', 'alt': ''},
    ],
    'occupations': [
        {'id': 'o1', 'name': 'industrial automation technician', 'isco': '3113', 'skills': [{'id': 's2', 'type': 'essential'}, {'id': 's3', 'type': 'optional'}]},
        {'id': 'o2', 'name': 'industrial engineer', 'isco': '2141', 'skills': [{'id': 's1', 'type': 'essential'}]},
    ],
}
html = (root / 'index.html').read_text(encoding='utf8')
css = (root / 'styles.css').read_text(encoding='utf8')
engine = (root / 'engine.js').read_text(encoding='utf8').replace('export ', '')
app = (root / 'app.js').read_text(encoding='utf8').split('\n', 1)[1]  # Remove ES import before concatenating
html = html.replace('<link rel="stylesheet" href="styles.css" />', '<style>'+css+'</style>')
html = html.replace('<script type="module" src="app.js"></script>',
  '<script>window.fetch=async()=>({ok:true,json:async()=>('+json.dumps(FIXTURE)+')});</script><script type="module">'+engine+'\n'+app+'</script>')
html = re.sub(r'<link[^>]*fonts.googleapis[^>]*>|<link[^>]*fonts.gstatic[^>]*>', '', html)

with sync_playwright() as pw:
    opts={'headless':True}
    if os.environ.get('SCOUTFORGE_CHROMIUM'):opts['executable_path']=os.environ['SCOUTFORGE_CHROMIUM']
    browser = pw.chromium.launch(**opts)
    try:
        for width,height in [(1440,1000),(390,844)]:
            page = browser.new_page(viewport={'width':width,'height':height},accept_downloads=True)
            errors=[]
            page.on('pageerror', lambda err: errors.append(str(err)))
            page.set_content(html,wait_until='domcontentloaded')
            page.wait_for_function("document.getElementById('data-status').textContent.includes('TEST FIXTURE')")
            page.locator('#example').click()
            assert page.locator('#match-count').inner_text() != '0', 'Example must produce at least one verified fixture skill'
            page.get_by_role('tab',name='02 SKILLS ATLAS').click()
            page.locator('#graph svg').wait_for(timeout=10000)
            assert page.locator('.occupation-item').count()>0
            page.get_by_role('tab',name='03 SEARCHTWIN').click()
            assert page.locator('.strategy-card').count()==3
            assert page.locator('.syntax-row.invalid').count()==0
            page.get_by_role('tab',name='04 DOSSIER').click()
            assert page.locator('.dossier-paper').count()==1
            with page.expect_download(timeout=8000) as info:page.locator('#export-md').click()
            assert info.value.suggested_filename.endswith('.md')
            assert not errors,errors
            assert page.evaluate('document.documentElement.scrollWidth') <= width+1, f'horizontal overflow @ {width}'
            print(f'PASS desktop/mobile functional flow @{width}: evidence, ESCO graph, SearchTwin, dossier export')
            page.close()
    finally:browser.close()