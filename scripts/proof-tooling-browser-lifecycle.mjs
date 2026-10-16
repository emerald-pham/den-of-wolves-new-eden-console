/** Run a proof browser against injectable resources and close each owned handle. */
export async function withProofBrowserCleanup(run, {
  afterCleanup = async () => {},
  stopBuild = () => {},
} = {}) {
  const resources = { context: null, browser: null, browserServer: null };
  try {
    return await run(resources);
  } finally {
    if (resources.context) await resources.context.close();
    if (resources.browser) await resources.browser.close();
    if (resources.browserServer) await resources.browserServer.close();
    stopBuild();
    await afterCleanup(resources);
  }
}
