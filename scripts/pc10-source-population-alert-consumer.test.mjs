import assert from 'node:assert/strict';
import test from 'node:test';
import { matchVisiblePopulationAlerts } from './pc10-source-population-alert-consumer.mjs';

const gmInstanceId = 'gm-instance-original';
// Chromium innerText of the shipped dialog, observed in the mounted check (`.unrest-alert` uppercases it).
const styledIcebreaker = 'IMMEDIATE COMMAND ATTENTION REQUIRED\n\nSURVIVOR POPULATION THRESHOLD REACHED\n\n' +
  'ICEBREAKER SURVIVOR POPULATION HAS REACHED 28,000. A CENSUS THRESHOLD REQUIRES GM ATTENTION.\n\n' +
  'DISMISS POPULATION ALERT';
const icebreaker = { shipId: 'icebreaker', shipName: 'Icebreaker', population: 28000,
  targetGmInstanceIds: [gmInstanceId], createdAt: 1 };

function matchedShipIds(renderedText, populationAlerts) {
  return matchVisiblePopulationAlerts({ renderedText, populationAlerts, gmInstanceId }).map(([shipId]) => shipId);
}

test('the styled population alert binds to its one source row for the original GM', () => {
  assert.deepEqual(matchedShipIds(styledIcebreaker, { icebreaker }), ['icebreaker']);
  const [[, candidate]] = matchVisiblePopulationAlerts({ renderedText: styledIcebreaker,
    populationAlerts: { icebreaker }, gmInstanceId });
  assert.equal(candidate, icebreaker);
});

test('unstyled source-case dialog text still binds to the same row', () => {
  assert.deepEqual(matchedShipIds('Immediate command attention required\nSurvivor population threshold reached\n' +
    'Icebreaker survivor population has reached 28,000. A census threshold requires GM attention.', { icebreaker }),
  ['icebreaker']);
});

test('only the rendered row binds when two rows target the original GM', () => {
  const pallas = { shipId: 'pallas', shipName: 'Pallas', population: 31000,
    targetGmInstanceIds: [gmInstanceId], createdAt: 2 };
  assert.deepEqual(matchedShipIds(styledIcebreaker, { pallas, icebreaker }), ['icebreaker']);
});

test('foreign GM, wrong vessel, stale or delayed population and malformed rows gain no credit', () => {
  const cases = {
    foreignGm: { icebreaker: { ...icebreaker, targetGmInstanceIds: ['gm-instance-foreign'] } },
    noAudience: { icebreaker: { ...icebreaker, targetGmInstanceIds: undefined } },
    wrongVessel: { pallas: { ...icebreaker, shipId: 'pallas', shipName: 'Pallas' } },
    newerSourcePopulation: { icebreaker: { ...icebreaker, population: 29000 } },
    shorterPopulation: { icebreaker: { ...icebreaker, population: 8000 } },
    shipNameSuffixOfRenderedShip: { breaker: { ...icebreaker, shipId: 'breaker', shipName: 'Breaker' } },
    nonIntegerPopulation: { icebreaker: { ...icebreaker, population: 28000.5 } },
    missingShipName: { icebreaker: { ...icebreaker, shipName: undefined } },
    noRows: {},
  };
  for (const [label, populationAlerts] of Object.entries(cases)) {
    assert.deepEqual(matchedShipIds(styledIcebreaker, populationAlerts), [], label);
  }
  assert.deepEqual(matchedShipIds('', { icebreaker }), [], 'no rendered dialog');
  assert.deepEqual(matchedShipIds('IMMEDIATE COMMAND ATTENTION REQUIRED\nNOTE: ICEBREAKER SURVIVOR POPULATION ' +
    'HAS REACHED 28,000.', { icebreaker }), [], 'sentence not at the start of a rendered paragraph');
});
