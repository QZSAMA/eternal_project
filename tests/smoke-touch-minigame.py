import os
import time
from playwright.sync_api import sync_playwright

BASE_URL = os.getenv("MINIGAME_BASE_URL", "http://127.0.0.1:18080") + "/index.html"

def wait_for_minigame(page, timeout=20):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        state = page.evaluate("Engine.state")
        if state == "in_minigame":
            return
        if state == "waiting_input":
            page.mouse.click(960, 540)
        elif state in ("ended", "in_proposal", "error"):
            raise AssertionError(f"unexpected state before minigame: {state}")
        page.wait_for_timeout(60)
    raise AssertionError("route did not reach minigame")

def start_relationship(page):
    page.goto(BASE_URL, wait_until="networkidle")
    page.locator("#startBtn").click()
    page.evaluate("Engine.state = 'playing'; Engine.jump('relationship');")
    wait_for_minigame(page)

def run_healing_button(page):
    start_relationship(page)
    page.locator("#mgNeedHealing").click(force=True)
    assert page.evaluate("Minigame.needsHealing") is True
    assert page.locator("#mgVoiceStatus").inner_text() == "我需要治疗"
    page.wait_for_timeout(1300)
    # At least one auto-spawned orb should have been converted; no selection UI is exposed.
    assert page.evaluate("Minigame.orbs.every(orb => orb.type === 'yellow')")
    page.locator("#mgSkip").click(force=True)
    for _ in range(40):
        if page.evaluate("Engine.state") != "in_minigame":
            break
        page.wait_for_timeout(80)
    assert page.evaluate("Engine.state") in ("playing", "waiting_input")

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, args=["--mute-audio", "--disable-audio-output"])
    touch = browser.new_context(viewport={"width": 1280, "height": 720}, has_touch=True, is_mobile=True)
    desktop = browser.new_context(viewport={"width": 1280, "height": 720}, has_touch=False)
    pages = [touch.new_page(), desktop.new_page()]
    errors = []
    for page in pages:
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("requestfailed", lambda request: errors.append(f"request failed: {request.url}"))
    run_healing_button(pages[0])
    start_relationship(pages[1])
    assert pages[1].locator("#mgNeedHealing").is_visible()
    pages[1].locator("#mgSkip").click(force=True)
    assert not errors, errors
    touch.close(); desktop.close(); browser.close()
