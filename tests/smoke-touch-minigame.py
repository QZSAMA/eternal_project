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
        elif state == "waiting_choice":
            page.locator(".choice-btn").first.click(force=True)
        elif state in ("ended", "in_proposal", "error"):
            raise AssertionError(f"unexpected state before minigame: {state}")
        page.wait_for_timeout(60)
    raise AssertionError("route did not reach minigame")


def start_gaming(page, mode=None):
    page.goto(BASE_URL, wait_until="networkidle")
    page.locator("#startBtn").click()
    if mode:
        page.evaluate("mode => { Minigame._chooseMode = () => mode; }", mode)
    page.evaluate("{ Engine.state = 'playing'; Engine.jump('gaming'); }")
    wait_for_minigame(page)


def dispatch_pointer(page, selector, event_type, pointer_id, x, y):
    page.evaluate(
        """({selector, eventType, pointerId, x, y}) => {
          const node = document.querySelector(selector);
          node.dispatchEvent(new PointerEvent(eventType, {
            bubbles: true,
            pointerId,
            pointerType: 'touch',
            clientX: x,
            clientY: y,
          }));
        }""",
        {"selector": selector, "eventType": event_type, "pointerId": pointer_id, "x": x, "y": y},
    )


def run_touch_controls(page):
    start_gaming(page, mode="2d")
    assert "is-visible" in (page.locator("#mgTouchControls").get_attribute("class") or "")

    rect = page.locator("#mgJoystick").bounding_box()
    assert rect
    center_x = rect["x"] + rect["width"] / 2
    center_y = rect["y"] + rect["height"] / 2
    dispatch_pointer(page, "#mgJoystick", "pointerdown", 7, center_x, center_y)
    dispatch_pointer(page, "#mgJoystick", "pointermove", 7, rect["x"] + rect["width"] * 0.9, center_y)
    assert page.evaluate("Minigame.touchInput.pointerId") == 7
    assert page.evaluate("Minigame.touchInput.moveX") > 0.5
    dispatch_pointer(page, "#mgJoystick", "pointercancel", 7, center_x, center_y)
    assert page.evaluate("Minigame.touchInput.pointerId") is None
    assert page.evaluate("Minigame.touchInput.moveX") == 0

    dispatch_pointer(page, "#mgTouchPurple", "pointerdown", 8, center_x, center_y)
    assert page.evaluate("Minigame.touchInput.leftDown") is True
    dispatch_pointer(page, "#mgTouchPurple", "pointerup", 8, center_x, center_y)
    assert page.evaluate("Minigame.touchInput.leftDown") is False

    dispatch_pointer(page, "#mgTouchYellow", "pointerdown", 9, center_x, center_y)
    assert page.evaluate("Minigame.touchInput.rightDown") is True
    dispatch_pointer(page, "#mgTouchYellow", "pointerup", 9, center_x, center_y)
    assert page.evaluate("Minigame.touchInput.rightDown") is False

    page.evaluate("Minigame.__reverseCalls = 0; Minigame._reverseOrbs = function () { Minigame.__reverseCalls += 1; }; void 0")
    page.locator("#mgTouchReverse").click(force=True)
    assert page.evaluate("Minigame.__reverseCalls") == 1
    page.locator("#mgSkip").dispatch_event("click")
    for _ in range(100):
        if page.evaluate("Engine.state") != "in_minigame":
            break
        page.wait_for_timeout(100)
    assert page.evaluate("Engine.state") in ("playing", "waiting_input")
    print("touch/2d: joystick, fire, reverse and skip passed")


def run_desktop_visibility(page):
    start_gaming(page)
    classes = page.locator("#mgTouchControls").get_attribute("class") or ""
    assert "is-visible" not in classes
    page.locator("#mgSkip").click(force=True)
    print("desktop: touch controls hidden and skip remains available")


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, args=["--mute-audio", "--disable-audio-output"])
    touch_context = browser.new_context(viewport={"width": 1280, "height": 720}, has_touch=True, is_mobile=True)
    desktop_context = browser.new_context(viewport={"width": 1280, "height": 720}, has_touch=False)
    pages = [touch_context.new_page(), desktop_context.new_page()]
    errors = []
    for page in pages:
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("requestfailed", lambda request: errors.append(f"request failed: {request.url}"))
    run_touch_controls(pages[0])
    run_desktop_visibility(pages[1])
    assert not errors, errors
    touch_context.close()
    desktop_context.close()
    browser.close()
