from pathlib import Path
from playwright.sync_api import sync_playwright

COPY = '但是，\n他还想和你一起，创造更多美好的回忆。\nSo… Will you marry me?'
OUTPUT = Path(__file__).resolve().parents[1] / 'output' / 'proposal-layout'
OUTPUT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--mute-audio', '--disable-audio-output'])
    for width, height, motion in [(1280, 720, 'no-preference'), (844, 390, 'no-preference'), (390, 844, 'reduce')]:
        page = browser.new_page(viewport={'width': width, 'height': height}, reduced_motion=motion)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('requestfailed', lambda request: errors.append(request.url))
        page.route('**/*', lambda route: route.continue_() if route.request.url.startswith('http://127.0.0.1:18082/') else route.abort())
        page.goto('http://127.0.0.1:18082/', wait_until='networkidle')
        page.locator('#startBtn').click()
        page.evaluate("Engine.state = 'playing'; Engine.jump('proposal');")
        page.wait_for_function("Engine.state === 'in_proposal'")
        assert page.locator('#proposalText').inner_text() == COPY
        assert page.locator('#proposalText').evaluate('e => getComputedStyle(e).whiteSpace') == 'pre-line'
        page.wait_for_timeout(3500)
        stage = page.locator('#stage').bounding_box()
        def inside(selector):
            box = page.locator(selector).bounding_box()
            assert box and box['x'] >= stage['x'] - 1 and box['y'] >= stage['y'] - 1, selector
            assert box['x'] + box['width'] <= stage['x'] + stage['width'] + 1, selector
            assert box['y'] + box['height'] <= stage['y'] + stage['height'] + 1, selector
            return box
        for selector in ['#ringWrap', '#proposalText', '#proposalBtns']:
            inside(selector)
        portrait = page.locator('.char-slot.is-show .char-img').bounding_box()
        assert portrait, 'proposal portrait must remain visible'
        for selector in ['#ringWrap', '#proposalText', '#proposalBtns']:
            box = page.locator(selector).bounding_box()
            assert portrait['x'] + portrait['width'] < box['x'], f'{selector} overlaps the portrait'
        page.screenshot(path=str(OUTPUT / f'proposal-{width}.png'))
        # The acceptance button intentionally pulses; click its visible center.
        accept = page.locator('#btnAccept').bounding_box()
        page.mouse.click(accept['x'] + accept['width'] / 2, accept['y'] + accept['height'] / 2)
        page.wait_for_function("Engine.state === 'ended'")
        page.wait_for_timeout(1600)
        assert page.locator('#endingBig').inner_text() == 'SHE SAID YES !!'
        assert page.locator('#endingContinuation').inner_text() == 'つづく\n未完待续'
        assert page.locator('#endingBig').evaluate('e => parseFloat(getComputedStyle(e).fontSize)') >= 140
        title = inside('#endingBig')
        corner = inside('#endingContinuation')
        restart = inside('#endingRestart')
        assert corner['x'] > stage['x'] + stage['width'] / 2
        assert corner['y'] > stage['y'] + stage['height'] / 2
        assert restart['x'] + restart['width'] < corner['x'] or restart['y'] + restart['height'] < corner['y']
        page.screenshot(path=str(OUTPUT / f'ending-{width}.png'))
        page.locator('#endingRestart').click()
        page.locator('#endingConfirmNo').click()
        assert page.evaluate('Engine.state') == 'ended'
        assert not errors, errors
        page.close()
        print(f'PASS {width}x{height}, motion={motion}')
    browser.close()
