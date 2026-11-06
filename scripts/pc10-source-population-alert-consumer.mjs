/** Binds the original GM's visible population alert to exactly one current source alert row. */
export const POPULATION_ALERT_DIALOG_NAME = 'Survivor population threshold reached';

/** The source sentence PopulationAlert renders for one alert row. */
export function populationAlertSentence(candidate) {
  return `${candidate.shipName} survivor population has reached ${candidate.population.toLocaleString('en-US')}.`;
}

/** Rendered text (e.g. Chromium innerText) as case-folded paragraphs; CSS text-transform changes case only. */
function renderedParagraphs(renderedText) {
  return String(renderedText ?? '').split(/\n+/)
    .map(line => line.replace(/\s+/g, ' ').trim().toUpperCase())
    .filter(Boolean);
}

/**
 * Whether one rendered paragraph is `phrase` or begins with it followed by a space or full stop,
 * compared case-insensitively on both sides because the shipped alert styling uppercases text.
 */
export function renderedParagraphStartsWith(renderedText, phrase) {
  const target = String(phrase ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
  return target.length > 0 && renderedParagraphs(renderedText).some(paragraph => paragraph === target ||
    paragraph.startsWith(`${target} `) || paragraph.startsWith(`${target}.`));
}

/**
 * Returns the `[shipId, alert]` source rows that the rendered dialog text proves are visible to
 * `gmInstanceId`. A row binds only when a rendered paragraph begins with its exact sentence (ship
 * name and en-US population), compared case-insensitively because the shipped `.unrest-alert`
 * styling uppercases the dialog. A caller must still require exactly one match before acknowledging.
 */
export function matchVisiblePopulationAlerts({ renderedText, populationAlerts, gmInstanceId }) {
  const paragraphs = renderedParagraphs(renderedText);
  return Object.entries(populationAlerts ?? {}).filter(([, candidate]) => {
    if (!candidate.targetGmInstanceIds?.includes(gmInstanceId) ||
      typeof candidate.shipName !== 'string' || !Number.isSafeInteger(candidate.population)) return false;
    const sentence = populationAlertSentence(candidate).toUpperCase();
    return paragraphs.some(paragraph => paragraph === sentence || paragraph.startsWith(`${sentence} `));
  });
}
