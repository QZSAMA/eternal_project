from playwright.sync_api import sync_playwright

def advance_until(page, target, timeout=45000):
    deadline = page.evaluate("Date.now()") + timeout
    while page.evaluate("Date.now()") < deadline:
        state = page.evaluate("Engine.state")
        if state == target:
            return
        elif state == "in_minigame":
            page.locator("#mgSkip").click(force=True)
        elif state == "waiting_input":
            page.mouse.click(960, 540)
        elif state in ("error", "ended"):
            raise AssertionError(f"unexpected state: {state}")
        page.wait_for_timeout(70)
    raise AssertionError(f"route did not reach {target}")

def run_route(page):
    page.goto("http://127.0.0.1:18080/index.html", wait_until="networkidle")
    page.locator("#startBtn").click()
    page.evaluate("Engine.state = 'playing'; Engine.jump('relationship');")
    advance_until(page, "in_minigame")
    page.locator("#mgSkip").click(force=True)
    advance_until(page, "in_memory")
    assert page.locator("#memoryBut").is_visible()
    assert page.locator("#memoryCaption").inner_text()
    first = page.locator("#memoryCaption").inner_text()
    page.wait_for_timeout(3600)
    assert page.locator("#memoryCaption").inner_text() != first
    page.locator("#memoryBut").click()
    assert page.locator("#memoryFinal").inner_text() == ""
    assert "Will you marry me?" in page.locator("#proposalText").inner_text()
    assert page.locator("#proposalText").inner_text().count("Will you marry me?") == 1
    advance_until(page, "in_proposal", timeout=5000)
    assert not page.locator("#ringWrap").evaluate("node => node.classList.contains('is-show')")
    page.wait_for_timeout(650)
    assert page.locator("#ringWrap").evaluate("node => node.classList.contains('is-show')")
    assert "Will you marry me?" in page.locator("#proposalText").inner_text()

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, args=["--mute-audio", "--disable-audio-output"])
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("requestfailed", lambda request: errors.append(f"request failed: {request.url}"))
    run_route(page)
    assert not errors, errors
    browser.close()
