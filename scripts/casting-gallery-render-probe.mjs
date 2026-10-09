// Called only by a parent-allocated browser harness; this module starts no runtime.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

export async function assertReducedGallery(page, evidenceDirectory, label) {
  const gallery = page.locator('.casting-intro__flags');
  await gallery.waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.querySelectorAll('.casting-intro img')].map(image => image.decode()));
  });
  const metrics = await gallery.evaluate(stage => {
    const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    return { stage: rect(stage), viewportWidth: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      skip: rect(stage.parentElement.querySelector('button')), figures: [...stage.querySelectorAll('figure')].map(figure => ({
        flag: figure.dataset.flag, frame: rect(figure), image: rect(figure.querySelector('img')),
        caption: rect(figure.querySelector('figcaption')), animation: getComputedStyle(figure).animationName,
      })) };
  });
  await writeFile(`${evidenceDirectory}/${label}-geometry.json`, JSON.stringify(metrics, null, 2));
  assert.equal(metrics.figures.length, 7);
  assert.equal(new Set(metrics.figures.map(item => item.flag)).size, 7);
  assert.ok(metrics.scrollWidth <= metrics.viewportWidth + 1, 'no horizontal overflow');
  assert.ok(metrics.skip.y >= metrics.stage.bottom - 1, 'Skip has a separate row');
  for (const item of metrics.figures) {
    assert.equal(item.animation, 'none');
    assert.ok(item.image.height > 0 && item.caption.height > 0);
    assert.ok(item.caption.y >= item.image.bottom - 1, `${item.flag}: caption below artwork`);
    for (const child of [item.image, item.caption]) {
      assert.ok(child.y >= item.frame.y - 1 && child.bottom <= item.frame.bottom + 1, `${item.flag}: figure contains child`);
      assert.ok(child.x >= metrics.stage.x - 1 && child.right <= metrics.stage.right + 1, `${item.flag}: within gallery width`);
    }
    for (const other of metrics.figures) {
      if (item === other) continue;
      const horizontal = Math.min(item.frame.right, other.frame.right) - Math.max(item.frame.x, other.frame.x);
      const vertical = Math.min(item.frame.bottom, other.frame.bottom) - Math.max(item.frame.y, other.frame.y);
      assert.ok(horizontal <= 1 || vertical <= 1, `${item.flag}/${other.flag}: figures do not overlap`);
    }
  }
  await page.keyboard.press('Tab');
  assert.equal(await gallery.evaluate(element => document.activeElement === element), true);
  for (const [position, fraction] of [['top', 0], ['middle', .5], ['bottom', 1]]) {
    await gallery.evaluate((element, value) => { element.scrollTop = (element.scrollHeight - element.clientHeight) * value; }, fraction);
    await page.screenshot({ path: `${evidenceDirectory}/${label}-${position}.png` });
  }
  const finalCaption = await gallery.locator('figcaption').last().boundingBox();
  assert.ok(finalCaption && finalCaption.y >= metrics.stage.y - 1 && finalCaption.y + finalCaption.height <= metrics.stage.bottom + 1, 'final caption reachable');
  return metrics;
}
