const MONO = 'SFMono-Regular,Consolas,Liberation Mono,monospace';
const PALETTE = Object.freeze({ void:'#04070a', ink:'#e4ecee', amber:'#e8892b', cyan:'#46c8de' });
const family = value => typeof value === 'string' ? value.replace(/["'\s]/g,'').toLowerCase() : '';
const fail = message => { throw new Error(message); };

/** Validate the actual alternative/link/code; QR pixels require a separate decoder. */
export function assertNormalSettingsJoin({baseHref,href,joinCode,linkName,qrName,code}) {
  if (typeof joinCode !== 'string' || !/^\d{4}(?:\d{2})?$/.test(joinCode)) fail('Invalid normal join code.');
  let base, actual;
  try { base=new URL(baseHref); actual=new URL(href); } catch { fail('Invalid ordinary join URL.'); }
  const expected=`${base.origin}${base.pathname}#/?joinCode=${joinCode}`;
  if (!['http:','https:'].includes(base.protocol) || base.username || base.password ||
      typeof href !== 'string' || href !== expected || actual.username || actual.password || actual.search) {
    fail('The QR alternative must carry only the ordinary join URL and code.');
  }
  if (linkName !== `Open join screen for session ${joinCode}` || qrName !== `QR code for session ${joinCode}` || code !== joinCode) {
    fail('The accessible join link, QR label and visible code must agree.');
  }
  return expected;
}

const ACTOR_FIELDS = ['hasAuth','sameActor','uidHash','sessionId','playerRole','profileRoleId','assignedRoleId',
  'connection','freshness','cycle','phase','gmInstanceOwned','gmAccessAuthenticated','briefMatchesActor','briefRoleId'];
/** Never serialize the whole store/observe result, raw UID, private brief or outbox. */
export function settingsActorRecord(state) {
  return Object.fromEntries(ACTOR_FIELDS.filter(key=>Object.hasOwn(state,key)).map(key=>{
    if (state[key] !== null && !['string','number','boolean'].includes(typeof state[key])) fail('Actor metadata must contain only bounded scalar fields.');
    return [key,state[key]];
  }));
}
export function assertSettingsReturnUrl(href,expected,joinCode) {
  let url;
  try { url=new URL(href); } catch { fail('Invalid normal actor return URL.'); }
  if (url.protocol!=='http:' || !['127.0.0.1','localhost'].includes(url.hostname) || url.username || url.password ||
      [...url.searchParams.keys()].some(key=>!['demoActor','demoJoin'].includes(key)) ||
      url.searchParams.getAll('demoActor').length!==1 || url.searchParams.get('demoActor')!==`${expected.sessionId}~${expected.roleId}` ||
      url.searchParams.getAll('demoJoin').length!==1 || url.searchParams.get('demoJoin')!==joinCode ||
      !/^#\/[A-Za-z0-9/_-]*$/.test(url.hash) || /^#\/gm(?:\/|$)/.test(url.hash)) fail('Only the original local normal actor URL may restore this UI.');
  return href;
}
export function assertOriginalSettingsActor(state,expected) {
  if (!/^[a-f0-9]{16}$/.test(expected.uidHash ?? '') || !expected.sessionId || !expected.roleId ||
      state.hasAuth !== true || state.sameActor !== true || state.uidHash !== expected.uidHash ||
      state.sessionId !== expected.sessionId || state.profileRoleId !== expected.roleId ||
      state.assignedRoleId !== expected.roleId || state.playerRole !== 'player' ||
      state.gmInstanceOwned !== false || state.gmAccessAuthenticated !== false) {
    fail('The original ordinary roster actor and Auth identity are required.');
  }
  if (state.connection !== 'live' || state.freshness !== 'server' || state.phase !== 'active' ||
      !Number.isSafeInteger(state.cycle) || state.cycle < 1) fail('The original actor needs live active session authority.');
  if (state.briefMatchesActor !== true || state.briefRoleId !== expected.roleId) fail('The current private brief must belong to the original actor.');
  return settingsActorRecord(state);
}

const boxValid = rect => rect && ['left','top','right','bottom','width','height'].every(key=>Number.isFinite(rect[key])) &&
  rect.width > 0 && rect.height > 0;
export function settingsGeometryFailures(metrics) {
  const failures=[], {viewport,dialog,qr}=metrics;
  if (!viewport || !Number.isSafeInteger(viewport.width) || !Number.isSafeInteger(viewport.height) || viewport.width < 1 || viewport.height < 1) {
    return ['Invalid measured viewport.'];
  }
  for (const name of ['documentWidth','bodyWidth']) {
    if (!Number.isFinite(metrics[name]) || metrics[name] > viewport.width+1) failures.push(`${name} has horizontal overflow.`);
  }
  if (!boxValid(dialog) || dialog.left < -1 || dialog.right > viewport.width+1) failures.push('Settings dialog exceeds the viewport width.');
  const fitted = rect => boxValid(rect) && rect.left >= 0 && rect.top >= 0 && rect.right <= viewport.width && rect.bottom <= viewport.height;
  if (!fitted(qr) || metrics.qrVisibleAtCenter !== true) failures.push('QR is clipped, covered or has no painted size.');
  if (!Array.isArray(metrics.controls) || !metrics.controls.length) failures.push('No actual controls were measured.');
  for (const control of metrics.controls ?? []) {
    if (!fitted(control.rect) || control.visibleAtCenter !== true) failures.push(`${control.name}: control is clipped or covered.`);
    if (!boxValid(control.rect) || control.rect.width < 44 || control.rect.height < 44) {
      failures.push(`${control.name}: 44px target required; measured ${control.rect?.width}x${control.rect?.height}.`);
    }
  }
  return failures;
}
function rgbHex(value) {
  const rgb=typeof value === 'string' && value.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  return rgb ? `#${rgb.slice(1).map(component=>Number(component).toString(16).padStart(2,'0')).join('')}` : value?.toLowerCase();
}
export function settingsTokenFailures(tokens) {
  const failures=[];
  if (family(tokens.mono) !== family(MONO)) failures.push('CIC mono token differs from the issued source.');
  if (!['0','0px'].includes(tokens.radius)) failures.push('Settings frame is not square.');
  for (const [key,value] of Object.entries(PALETTE)) if (rgbHex(tokens[key]) !== value) failures.push(`CIC ${key} token changed.`);
  if (!Array.isArray(tokens.samples) || !tokens.samples.length) failures.push('No rendered type samples.');
  for (const sample of tokens.samples ?? []) {
    if (family(sample.fontFamily) !== family(MONO) || !Number.isFinite(sample.fontSize) || sample.fontSize <= 0) failures.push(`${sample.name}: invalid CIC type.`);
    if (sample.expectedColor && rgbHex(sample.color) !== PALETTE[sample.expectedColor]) failures.push(`${sample.name}: source palette mismatch.`);
  }
  return failures;
}
export function assertStableSettingsBinding(start,end) {
  if (start.trackedDirty || end.trackedDirty) fail('Settings proof source is tracked-dirty.');
  if (!/^[a-f0-9]{40}$/.test(start.sourceCommit ?? '') || start.sourceCommit !== end.sourceCommit) fail('Settings proof source changed.');
  if (!/^[a-f0-9]{64}$/.test(start.compiledTreeSha256 ?? '') || start.compiledTreeSha256 !== end.compiledTreeSha256) fail('The full compiled Functions tree changed.');
  if (JSON.stringify(start.sourceFiles)!==JSON.stringify(end.sourceFiles)) fail('Mounted source bytes changed.');
  if (JSON.stringify(start.callbackFiles)!==JSON.stringify(end.callbackFiles)) fail('Settings callback bytes changed.');
}
