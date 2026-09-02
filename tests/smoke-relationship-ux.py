from playwright.sync_api import sync_playwright


def run_route(page, route):
    page.goto("http://127.0.0.1:18080/index.html", wait_until="networkidle")
    print("loaded", route, page.evaluate("typeof Engine"), page.locator("#layerStart").get_attribute("class"))
    page.locator("#startMuteBtn").click()
    assert page.evaluate("Engine.state") == "idle"
    assert page.locator("#startMuteBtn").get_attribute("aria-pressed") == "true"
    assert page.locator("#muteBtn").get_attribute("aria-pressed") == "true"
    page.locator("#startBtn").click()
    assert page.locator("#muteBtn").get_attribute("aria-pressed") == "true"
    page.evaluate("route => { Engine.state = 'playing'; Engine.jump(route); }", route)
    print("jumped", page.locator("#layerMontage").get_attribute("style"), page.locator("#layerError").get_attribute("class"))

    deadline = page.evaluate("Date.now()") + 45000
    while page.evaluate("Date.now()") < deadline:
        state = page.evaluate("Engine.state")
        if state == "in_montage":
            break
        if state == "waiting_input":
            page.mouse.click(960, 540)
        elif state == "waiting_choice":
            page.locator(".choice-btn").first.click()
        elif state == "in_minigame":
            page.locator("#mgSkip").click(force=True)
        elif state in ("in_proposal", "ended", "error"):
            raise AssertionError(f"unexpected state before montage: {state}")
        page.wait_for_timeout(80)
    else:
        raise AssertionError("route did not reach montage")

    page.wait_for_selector("#layerMontage", state="visible")

    toggle = page.locator("#montageToggle")
    status = page.locator("#montageStatus")
    toggle.click()
    assert status.inner_text() == "已暂停"
    assert toggle.get_attribute("aria-pressed") == "true"
    page.wait_for_timeout(900)
    assert status.inner_text() == "已暂停"
    toggle.click()
    assert status.inner_text() == "播放中"
    page.keyboard.press("Space")
    assert status.inner_text() == "已暂停"
    page.keyboard.press("Enter")
    assert status.inner_text() == "播放中"

    deadline = page.evaluate("Date.now()") + 30000
    while page.evaluate("Date.now()") < deadline and page.evaluate("Engine.state") != "in_proposal":
        state = page.evaluate("Engine.state")
        if state == "waiting_input":
            page.mouse.click(960, 540)
        elif state == "waiting_choice":
            page.locator(".choice-btn").first.click()
        page.wait_for_timeout(80)
    assert page.evaluate("Engine.state") == "in_proposal"
    assert page.locator("#startMuteBtn").count() == 1
    print(f"{route}: montage pause/resume and proposal transition passed")


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, args=["--mute-audio", "--disable-audio-output"])
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("requestfailed", lambda request: errors.append(f"request failed: {request.url}"))
    run_route(page, "gaming")
    run_route(page, "first_date")
    assert not errors, errors
    browser.close()
