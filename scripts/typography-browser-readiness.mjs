// Lazy route headings can appear before the controls whose styles we sample.
// Start every visibility wait together, retaining the existing 15-second bound.
export async function waitForTypographyTargets(page, targets) {
  await Promise.all(targets.map(([, selector]) => (
    page.locator(selector).first().waitFor({ state: 'visible', timeout: 15_000 })
  )));
}

// Saved synthetic actors cannot resume real sessions. Keep their local rendering
// stable without creating authorized responses or contacting production services.
export async function installTypographyNetworkBoundary(context, appUrl) {
  const origin = new URL(appUrl);
  if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1') {
    throw new Error('Typography fixtures require a local Vite origin.');
  }
  await context.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin === origin.origin) {
      await route.continue();
    } else {
      await route.abort('internetdisconnected');
    }
  });
}
