"""End-to-end browser test of the packaged site at desktop and mobile widths.

Run after `python scripts/build_site.py`:
    SCOUTFORGE_SITE_ROOT=_site python tests/browser_smoke.py
Checks real user flows, downloads, accessibility basics, no external requests and
no horizontal overflow on mobile. Uses only fictional example data.
"""
from __future__ import annotations

import os
import re
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from zipfile import ZipFile

from playwright.sync_api import sync_playwright, expect

ROOT = Path(os.environ.get("SCOUTFORGE_SITE_ROOT", Path(__file__).resolve().parent.parent / "_site")).resolve()
OUT = Path(os.environ.get("SCOUTFORGE_ARTIFACTS", "/tmp/scoutforge-e2e")); OUT.mkdir(parents=True, exist_ok=True)


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def run(page, base, width):
    errors, external = [], []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("request", lambda r: external.append(r.url) if not r.url.startswith(base) else None)

    page.goto(base + "/", wait_until="networkidle")
    assets = page.evaluate("() => [...document.querySelectorAll('link[rel=stylesheet], script[type=module]')].map(e => e.getAttribute('href') || e.getAttribute('src'))")
    assert any(re.match(r"^styles\.[0-9a-f]{12}\.css$", a) for a in assets), assets
    assert any(re.match(r"^js/app\.[0-9a-f]{12}\.js$", a) for a in assets), assets
    assert page.evaluate("getComputedStyle(document.body).fontFamily").startswith("Archivo"), "self-hosted font missing"
    # Design regressions: visible brand/navigation at mobile width and readable primary action.
    expect(page.locator(".intro-kicker")).to_be_visible()
    assert page.locator(".hero-steps li").count() == 3
    expect(page.locator("#analyze")).to_be_visible()
    assert page.locator("#analyze").evaluate("(el) => getComputedStyle(el).backgroundColor") == "rgb(255, 206, 50)"
    if width == 390:
        expect(page.locator(".brand span")).to_be_visible()
        expect(page.locator(".mainnav a")).to_have_count(4)
        assert page.locator(".mainnav").evaluate("(el) => el.getBoundingClientRect().height") >= 40
    page.screenshot(path=str(OUT / f"workbench-start-{width}.png"), full_page=True)

    # 1. The v0.4 failure case now produces a clean, specific search.
    page.fill("#jd", "Industrial Automation Engineer\n\nWe are hiring an automation engineer for a high-volume manufacturing plant.\nExperience with PLCs, Siemens S7 and TIA Portal is important. You will troubleshoot industrial automation systems.\nKnowledge of Python and SQL would be useful.")
    page.click("#analyze")
    # The intake folds away so the results lead; the role title is visible below the sticky bar.
    expect(page.locator("#intro")).to_be_hidden()
    expect(page.locator("#role-title")).to_be_in_viewport()
    assert page.locator('.out[data-platform="recruiter"]').evaluate(
        "(el) => getComputedStyle(el).borderTopStyle"
    ) == "solid"
    page.screenshot(path=str(OUT / f"workbench-result-{width}.png"), full_page=True)
    kw = page.locator("#out-li-kw")
    expect(kw).to_have_value(re.compile(r"PLC OR SPS"))
    for junk in ["bridge", "textile", "fisheries", "ropes"]:
        assert junk not in kw.input_value().lower(), kw.input_value()
    expect(page.locator('.check[data-for="out-li-kw"]')).to_have_class(re.compile("ok"))
    assert "Automatisierungstechniker" in page.locator("#out-li-title").input_value()

    # Evidence panel shows the source sentence with the matched phrase marked (keyboard focus works on touch too).
    page.locator("#must-chips .chip", has_text="TIA Portal").focus()
    expect(page.locator("#evidence mark")).to_have_text(re.compile("TIA Portal", re.I))
    expect(page.locator("#evidence q")).to_contain_text("Siemens S7")

    # 2. Toggling a skill and the strategy changes the string.
    before = kw.input_value()
    page.locator("#nice-chips .chip", has_text="Python").click()
    assert "Python" in kw.input_value() and kw.input_value() != before
    page.locator("#strategy label", has_text="Narrow").click()
    assert kw.input_value().count(" AND ") >= 2
    # Polish profile language adds Polish titles.
    page.locator("#langs label", has_text="Polish").click()
    expect(page.locator("#out-li-title")).to_have_value(re.compile("automatyk"))
    # Editing shows validation errors.
    kw.fill("(PLC OR SPS")
    expect(page.locator('.check[data-for="out-li-kw"]')).to_contain_text("not closed")

    # 3. Example role, talent map and company X-ray.
    page.click("#edit-jd")
    expect(page.locator("#jd")).to_be_visible()
    page.click('[data-example="maintenance"]')
    # Long title lists are collapsed until asked for.
    more = page.locator("#titles-more")
    expect(more).to_be_visible()
    shown = page.locator("#title-chips .chip").count()
    more.click()
    assert page.locator("#title-chips .chip").count() > shown
    # Tabs follow the ARIA keyboard pattern.
    page.locator("#tab-search").focus()
    page.keyboard.press("ArrowRight")
    expect(page.locator("#tab-map")).to_have_attribute("aria-selected", "true")
    expect(page.locator("#panel-map")).to_be_visible()
    page.click('.tab[data-tab="map"]')
    cx = page.locator("#out-company-xray")
    expect(cx).to_have_value(re.compile(r"^site:linkedin\.com/in .*Rolls-Royce"))
    page.locator(".emp", has_text="Rolls-Royce").locator("input").uncheck()
    assert "Rolls-Royce" not in cx.input_value()

    # 4. Outreach: the check reacts to edits.
    page.click('.tab[data-tab="outreach"]')
    score = int(page.locator("#msg-score").inner_text())
    body = page.locator("#msg-body").input_value()
    filled = re.sub(r"\[[^\]]+\]", lambda m: "Alex" if "name" in m.group(0).lower() else "your experience maintaining KUKA robots", body)
    page.fill("#msg-body", filled)
    assert int(page.locator("#msg-score").inner_text()) > score
    page.locator("#out-lang label", has_text="Deutsch").click()
    expect(page.locator("#msg-body")).to_have_value(re.compile("Guten Tag"))

    # 5. AI tab: prompts listed, button disabled without a key.
    page.click('.tab[data-tab="ai"]')
    assert page.locator("#prompt-list .prompt").count() == 6
    expect(page.locator("#ai-suggest")).to_be_disabled()

    # 6. Exports from the role header: workbook with formulas, brief and prompt library.
    with page.expect_download() as d:
        page.click("#dl-xlsx")
    xlsx = OUT / f"workbook-{width}.xlsx"; d.value.save_as(xlsx)
    with ZipFile(xlsx) as z:
        assert z.testzip() is None
        names = z.namelist()
        assert "xl/worksheets/sheet4.xml" in names
        funnel = z.read("xl/worksheets/sheet4.xml").decode()
        assert "<f>COUNTIFS(Pipeline!" in funnel
        assert 'fullCalcOnLoad="1"' in z.read("xl/workbook.xml").decode()
    with page.expect_download() as d:
        page.click("#dl-brief")
    brief = OUT / f"brief-{width}.md"; d.value.save_as(brief)
    assert brief.read_text().startswith("# Sourcing brief:")
    with page.expect_download() as d:
        page.click("#dl-prompts")
    assert d.value.suggested_filename.startswith("prompt-library-")

    # 7. Batch.
    page.goto(base + "/#batch")
    page.click("#batch-example")
    assert page.locator("#batch-table tbody tr").count() == 4
    with page.expect_download() as d:
        page.click("#batch-xlsx")
    d.value.save_as(OUT / f"batch-{width}.xlsx")

    # 8. ATS data check with the fictional sample.
    page.goto(base + "/#ats")
    page.click("#ats-sample")
    expect(page.locator("#ats-issues")).not_to_have_text("–")
    assert page.locator("#ats-table tbody tr").count() >= 10
    with page.expect_download() as d:
        page.click("#ats-download")
    cleaned = OUT / f"cleaned-{width}.csv"; d.value.save_as(cleaned)
    assert "dq_flag" in cleaned.read_text().splitlines()[0]

    # 9. Method page shows the benchmark.
    page.goto(base + "/#method")
    expect(page.locator("#eval-summary .eval-card")).to_have_count(3)

    # Layout: no horizontal scrolling at any width.
    for view in ["#workbench", "#batch", "#ats", "#method"]:
        page.goto(base + "/" + view)
        page.wait_for_timeout(150)
        overflow = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        assert overflow <= 1, f"{view} overflows by {overflow}px at {width}"
    page.screenshot(path=str(OUT / f"method-{width}.png"), full_page=True)

    assert not errors, errors
    assert not external, f"external requests: {set(external)}"


def main():
    if not (ROOT / "index.html").is_file():
        sys.exit(f"Build the site first: {ROOT} has no index.html")
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(Quiet, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for width, height in [(1440, 1000), (390, 844)]:
                page = browser.new_page(viewport={"width": width, "height": height}, accept_downloads=True)
                run(page, base, width)
                page.close()
                print(f"ok: {width}px")
            browser.close()
    finally:
        server.shutdown()
    print("browser smoke test passed")


if __name__ == "__main__":
    main()
