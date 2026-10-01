// Lazy route headings can appear before the controls whose styles we sample.
// Start every visibility wait together, retaining the existing 15-second bound.
export async function waitForTypographyTargets(page, targets) {
  await Promise.all(targets.map(([, selector]) => (
    page.locator(selector).first().waitFor({ state: 'visible', timeout: 15_000 })
  )));
}
