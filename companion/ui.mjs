const flags = ['cpa', 'fas', 'gliese', 'icn', 'proxima', 'rosal', 'san'];
export function mountCasting(root, { adapter, route = { name: 'owner' }, motionReduced = false, introSeen = true, rememberIntro = () => {}, download } = {}) {
  const doc = root.ownerDocument, win = doc.defaultView;
  let data, screen = route.name === 'dossier' ? 'dossier' : route.name === 'form' ? 'form' : 'home';
  let error = '', notice = '', activeIntro = !introSeen, returnFocus, introTimer, focusAfterLoad = false, disposed = false, epoch = 0;
  let selectedResponse, selectedInstance, recipientId = '', draft, formLink = '', shareLink = '', updateOnly = false, busy = false;
  let activeAttemptKeys = new Set();
  const attempts = new Map(), characterDrafts = new Map(), formAnswers = {};
  let selectedSessionId = '', newLobbyName = '', gmPassword = '', joinCode = '';
  let newTemplate = { name: '', details: '' };
  let newCharacter = { playerName: '', characterName: '', details: '' }, newTemplateId = '';
  const invalidateSession = () => {
    epoch++; busy = false; gmPassword=''; joinCode=''; activeIntro = false; win.clearTimeout(introTimer); data = undefined; draft = undefined;
    selectedResponse = undefined; selectedInstance = undefined; formLink = ''; shareLink = ''; recipientId = '';
    newCharacter = { playerName: '', characterName: '', details: '' }; newTemplate = { name: '', details: '' };
    attempts.clear(); characterDrafts.clear(); for (const key of Object.keys(formAnswers)) delete formAnswers[key];
    screen = 'closed'; render();
  };
  const read = async (method, ...args) => { const version = epoch; const result = await adapter[method](...args); if (disposed || version !== epoch) throw Object.assign(new Error('session changed'), { code: 'unauthenticated' }); return result; };
  const loadOwner = () => read('load');
  const downloadCsv = csv => {
    if (download) { download(csv); return; }
    const url = win.URL.createObjectURL(new win.Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = node('a', undefined, { href: url, download: 'casting-responses.csv' }); root.append(link); link.click(); link.remove(); win.URL.revokeObjectURL(url);
  };
  const request = async (method, payload) => {
    const version = epoch;
    if (method === 'loginGmAccess') {
      const result = await adapter[method]({ ...structuredClone(payload), attempt: win.crypto.randomUUID() });
      if (disposed || version !== epoch) throw Object.assign(new Error('session changed'), { code: 'unauthenticated' });
      return result;
    }
    const identity = JSON.stringify([method, payload]);
    if (!attempts.has(identity)) attempts.set(identity, win.crypto.randomUUID());
    activeAttemptKeys.add(identity);
    const result = await adapter[method]({ ...structuredClone(payload), attempt: attempts.get(identity) });
    if (disposed || version !== epoch) throw Object.assign(new Error('session changed'), { code: 'unauthenticated' });
    return result;
  };
  const node = (tag, text, attributes = {}) => {
    const el = doc.createElement(tag); if (text !== undefined) el.textContent = text;
    for (const [key, value] of Object.entries(attributes)) if (value !== undefined) el.setAttribute(key, value);
    return el;
  };
  const button = (text, action, disabled = false) => {
    const el = node('button', text, { type: 'button' }); el.disabled = disabled; el.addEventListener('click', action); return el;
  };
  const heading = text => node('h1', text, { tabindex: '-1' });
  const field = (label, value, change, type = 'text', choices) => {
    const wrap = node('label', label), el = node(type === 'textarea' ? 'textarea' : choices ? 'select' : 'input');
    if (el.tagName === 'INPUT') el.type = type;
    if (choices) for (const [v, labelText] of choices) el.append(node('option', labelText, { value: v }));
    el.value = value ?? ''; el.addEventListener('input', () => change(el.value));
    if (choices) el.addEventListener('change', () => change(el.value));
    wrap.append(el); return wrap;
  };
  const action = async (operation, message) => {
    if (busy) return; const version = epoch, actionAttempts = new Set(); activeAttemptKeys = actionAttempts; error = ''; notice = 'Working…'; busy = true; render();
    try { await operation(); if (!disposed && version === epoch) { for (const key of actionAttempts) attempts.delete(key); busy = false; notice = message; render(); if (!activeIntro) root.querySelector('h1')?.focus(); } }
    catch (failure) { if (!disposed && version === epoch) { if (['permission-denied', 'unauthenticated', 'functions/permission-denied', 'functions/unauthenticated'].includes(failure?.code)) { invalidateSession(); return; } busy = false; error = 'Action failed. Your draft is preserved. Refresh current state before retrying a stale change.'; notice = ''; render(); } }
  };
  const navigate = name => { epoch++; screen = name; error = ''; notice = ''; render(); root.querySelector('h1')?.focus(); };
  function showIntro() {
    root.querySelector('.casting-intro')?.remove();
    const overlay = node('section', undefined, { class: `casting-intro${motionReduced ? ' casting-intro--static' : ''}`, 'aria-label': 'Faction flag introduction', role: 'dialog', 'aria-modal': 'true' });
    overlay.append(node('h2', 'Seven nations. One fleet.'));
    const stage = node('div', undefined, { class: 'casting-intro__flags', ...(motionReduced ? { tabindex: '0', role: 'list', 'aria-label': 'Seven faction flags' } : { 'aria-hidden': 'true' }) });
    flags.forEach((flag, i) => {
      const frame = node('figure', undefined, { 'data-flag': flag, ...(motionReduced ? { role: 'listitem', 'aria-label': flag.toUpperCase() } : {}), class: 'casting-intro__flag', style: `--flag-index:${i}` });
      frame.append(node('img', undefined, { src: new URL(`../src/assets/flags/${flag}.png`, import.meta.url).href, alt: '' }), node('figcaption', flag.toUpperCase())); stage.append(frame);
    });
    overlay.append(stage, node('p', motionReduced ? 'Reduced motion: flags shown together.' : 'The fleet assembles.'));
    const skip = button('Skip intro', finishIntro); overlay.append(skip); root.append(overlay);
    for (const child of root.children) if (child !== overlay) child.inert = true;
    skip.focus();
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') finishIntro(); if (event.key === 'Tab') { event.preventDefault(); if (motionReduced) (doc.activeElement === stage ? skip : stage).focus(); else skip.focus(); } });
    win.clearTimeout(introTimer); if (!motionReduced) introTimer = win.setTimeout(finishIntro, 7600);
  }
  function finishIntro() {
    win.clearTimeout(introTimer); activeIntro = false; focusAfterLoad = !data; rememberIntro();
    root.querySelector('.casting-intro')?.remove(); for (const child of root.children) child.inert = false;
    (returnFocus?.isConnected ? returnFocus : root.querySelector('h1'))?.focus(); returnFocus = undefined;
  }
  function renderQuestions(container, schema, values = {}, preview = false) {
    for (const section of schema.sections) {
      const group = node('fieldset'); group.append(node('legend', section.title));
      for (const q of section.questions) {
        const label = `${q.label}${q.required ? ' *' : ''}`;
        if (q.type === 'multiple' || q.type === 'single') {
          const choices = node('fieldset'); choices.append(node('legend', label));
          q.options.forEach(option => {
            const wrap = node('label', option), input = node('input', undefined, { type: q.type === 'multiple' ? 'checkbox' : 'radio', name: q.id, value: option });
            input.checked = q.type === 'multiple' ? (values[q.id] ?? []).includes(option) : values[q.id] === option;
            input.addEventListener('change', () => { values[q.id] = q.type === 'multiple' ? [...choices.querySelectorAll('input:checked')].map(i => i.value) : option; });
            wrap.prepend(input); choices.append(wrap);
          }); group.append(choices);
        } else {
          const wrap = field(label, values[q.id], v => { values[q.id] = v; }, q.type === 'long' ? 'textarea' : q.type === 'link' ? 'url' : 'text', q.type === 'dropdown' ? [['', 'Choose…'], ...q.options.map(v => [v, v])] : undefined);
          const input = wrap.querySelector('input,textarea,select'); input.setAttribute('aria-label', q.label); input.required = q.required; group.append(wrap);
        }
      }
      container.append(group);
    }
    if (preview) container.append(node('p', 'Preview only. No response is collected.'));
  }
  function render() {
    if (disposed) return;
    root.replaceChildren(); root.className = 'casting-shell';
    if (screen === 'closed') { root.append(heading('Session closed'), node('p', 'Private content cleared. Sign in again to verify current access.')); return; }
    root.append(node('p', 'DEN OF WOLVES / CASTING', { class: 'cic-overline' }));
    if (screen === 'dossier') {
      root.append(heading('Character dossier'), button('Close dossier', () => { epoch++; root.replaceChildren(heading('Dossier closed'), node('p', 'Private content cleared.')); }));
      if (data?.dossier) root.append(node('h2', data.dossier.characterName), node('p', data.dossier.playerName), node('div', data.dossier.details, { class: 'casting-prose' }), node('p', `Published revision ${data.dossier.revision}`));
      else root.append(node('p', error || 'Loading published dossier…', { role: error ? 'alert' : 'status' }));
      return;
    }
    if (screen === 'form') {
      root.append(heading(data?.definition.title ?? 'Casting form'), button('Close form', () => { epoch++; root.replaceChildren(heading('Form closed')); }));
      if (data?.definition) {
        root.append(node('p', data.definition.description)); const form = node('form'), answers = formAnswers;
        renderQuestions(form, data.definition, answers); const submit = node('button', 'Submit response', { type: 'submit' }); submit.disabled = busy; form.append(submit);
        form.addEventListener('submit', event => { event.preventDefault(); if (busy) return; submit.disabled = true; action(async () => { await request('submit', { handle: route.handle, version: data.version, answers }); screen = 'submitted'; }, 'Response received.'); }); root.append(form);
      } else root.append(node('p', error || 'Loading form…'));
      if (error) root.append(node('p', error, { role: 'alert' })); return;
    }
    if (screen === 'submitted') { root.append(heading('Response received'), node('p', 'The owner will review your response. Dossier access is shared separately.')); return; }
    if (data?.prerequisite) {
      const sessions = data.prerequisite.sessions, real = data.prerequisite.mode === 'firebase';
      if (!sessions.some(session => session.id === selectedSessionId)) selectedSessionId = sessions[0]?.id ?? '';
      const current = sessions.find(session => session.id === selectedSessionId);
      root.append(heading('Choose a DoW session'), node('p', 'Casting belongs to one existing session. Create or select a lobby, then use its current GM instance. Game start is a separate action. Only current server-validated GM access allows casting edits.'),
        field('New lobby name', newLobbyName, value => { newLobbyName = value; }),
        button(real ? 'Create lobby' : 'Create synthetic lobby', () => action(async () => { const result = await request('createSession', {name:newLobbyName}); selectedSessionId=result.id; data=await loadOwner(); }, 'Lobby created at turn zero. Claim GM separately.')),
        field('Selected session', selectedSessionId, value => { selectedSessionId=value; render(); root.querySelector('select')?.focus(); }, 'text', sessions.map(session=>[session.id, `${session.name} — ${session.phase}, turn ${session.currentTurn}`])),
        node('p', current?.gmActive ? (real ? 'Current GM instance available.' : 'Synthetic GM instance available.') : 'GM instance required. Session creation alone grants no editing.'),
        button(real ? 'Claim GM instance' : 'Claim synthetic GM instance', () => action(async () => { await request('claimSessionGm',{sessionId:selectedSessionId}); data=await loadOwner(); }, 'GM instance confirmed for this session.'), !current || current.gmActive || (real && !data.prerequisite.gmAccessActive)),
        button('Use selected session for casting', () => action(async () => { await request('selectSession',{sessionId:selectedSessionId}); data=await loadOwner(); draft=structuredClone(data.definition); }, 'Casting bound to selected session.'), !current?.gmActive));
      if(real)root.append(field('Session join code',joinCode,value=>{joinCode=value;}),button('Join existing session',()=>action(async()=>{const result=await request('joinSession',{joinCode});selectedSessionId=result.id;data=await loadOwner();},'Joined selected session.')));
      if(real && !data.prerequisite.gmAccessActive)root.append(field('GM access password',gmPassword,value=>{gmPassword=value;},'password'),button('Sign in to GM access',()=>action(async()=>{try{await request('loginGmAccess',{password:gmPassword});data=await loadOwner();}finally{gmPassword='';}},'GM access verified. Claim a session instance separately.')));
      if(error)root.append(node('p',error,{role:'alert'})); if(notice)root.append(node('p',notice,{role:'status'}));
      if(busy) for(const control of root.querySelectorAll('button,input,select'))control.disabled=true;
      if(activeIntro)showIntro(); return;
    }
    const nav = node('nav', undefined, { 'aria-label': 'Casting owner workspace' });
    for (const [label, name] of [['Workspace', 'home'], ['Form builder', 'builder'], ['Responses', 'responses'], ['Characters', 'characters'], ['Settings', 'settings']]) nav.append(button(label, () => navigate(name), !data || busy));
    root.append(nav);
    if (!data) {
      root.append(heading('Casting workspace'), node('p', error || 'Loading owner workspace…'));
      if (error) root.append(button('Retry connection', () => action(async () => { data = await loadOwner(); if (!data.prerequisite) draft = structuredClone(data.definition); }, 'Connection restored.'), busy));
      if (activeIntro) showIntro(); return;
    }
    if (screen === 'home') root.append(heading('Casting workspace'), node('p', 'Prepare a casting form, review responses, and publish personalized view-only dossier links.'), node('p', data.prerequisite?.mode === 'firebase' ? 'Casting is associated with the selected DoW session.' : 'Casting workspace. Responses remain private to authorized GMs.'));
    if (screen === 'builder') {
      root.append(heading('Form builder'), field('Title', draft.title, v => { draft.title = v; }), field('Description', draft.description, v => { draft.description = v; }, 'textarea'));
      draft.sections.forEach((section, sectionIndex) => {
        const group = node('fieldset'); group.append(node('legend', `Section ${sectionIndex + 1}`), field('Section title', section.title, v => { section.title = v; }));
        section.questions.forEach((q, questionIndex) => {
          const question = node('fieldset'); question.append(node('legend', `Question ${questionIndex + 1}`));
          question.append(field('Question label', q.label, v => { q.label = v; }), field('Question type', q.type, v => {
            if (q.type === v) return; q.type = v; if (['single', 'multiple', 'dropdown'].includes(v)) q.options ??= ['Option 1']; else delete q.options; render();
          }, 'text', [['short', 'Short text'], ['long', 'Long text'], ['single', 'Single choice'], ['multiple', 'Multiple choice'], ['dropdown', 'Dropdown'], ['link', 'HTTPS link']]));
          if (q.options) question.append(field('Choices — one per line', q.options.join('\n'), v => { q.options = v.split('\n').map(s => s.trim()).filter(Boolean); }, 'textarea'));
          const required = node('label', 'Required'), checkbox = node('input', undefined, { type: 'checkbox' }); checkbox.checked = q.required; checkbox.addEventListener('change', () => { q.required = checkbox.checked; }); required.prepend(checkbox); question.append(required, button('Remove question', () => { section.questions.splice(questionIndex, 1); render(); })); group.append(question);
        });
        group.append(button('Add question', () => { section.questions.push({ id: win.crypto.randomUUID(), label: 'New question', type: 'short', required: false }); render(); })); root.append(group);
      });
      root.append(button('Add section', () => { draft.sections.push({ title: 'New section', questions: [] }); render(); }), button('Preview form', () => navigate('preview')),
        button('Save draft', () => action(async () => { const result = await request('save', { definition: structuredClone(draft), expectedRevision: data.revision }); data.revision = result.revision; if(result.formSaved===true)data.formSaved=true; }, 'Draft saved.')),
        button('Publish form', () => action(async () => { const result = await request('publish', { expectedRevision: data.revision }); data.revision = result.revision ?? data.revision; formLink = `#form/${result.handle}`; }, 'Form published. Anyone with this link can submit.'), data.formSaved===false),
        button('Unpublish form', () => action(async () => { const result = await request('unpublish', { expectedRevision: data.revision }); data.revision = result.revision; formLink = ''; }, 'Form unpublished.')));
      if (formLink) root.append(node('a', 'Open direct form link', { href: formLink }));
    }
    if (screen === 'preview') { root.append(heading(draft.title), node('p', draft.description), button('Back to builder', () => navigate('builder'))); renderQuestions(root, draft, {}, true); }
    if (screen === 'responses') {
      root.append(heading('Owner responses'), button('Export responses CSV', () => action(async () => { downloadCsv(await read('exportResponses')); }, 'CSV exported. Downloaded copies cannot be recalled.')), button('Refresh responses', () => action(async () => { data = await loadOwner(); }, 'Current responses loaded.')));
      for (const response of data.responses) {
        const group = node('section'); group.append(node('h2', 'Casting response'), node('pre', JSON.stringify(response.answers, null, 2)));
        group.append(button('Assign character', () => { selectedResponse = response; selectedInstance = data.instances[0]; recipientId = ''; updateOnly = false; shareLink = ''; navigate('assignment'); }));
        if (response.handle) group.append(button('Preview dossier update', () => { selectedResponse = response; selectedInstance = data.instances.find(i => i.id === response.instanceId); updateOnly = true; navigate('assignment'); }), button('Revoke recipient access', () => { selectedResponse = response; navigate('revoke'); }));
        root.append(group);
      }
      if (!data.responses.length) root.append(node('p', 'No responses yet.'));
    }
    if (screen === 'assignment') {
      root.append(heading('Preview recipient dossier'), button('Back to responses', () => navigate('responses')));
      if (!updateOnly) root.append(field('Character instance', selectedInstance?.id ?? '', v => { selectedInstance = data.instances.find(i => i.id === v); render(); root.querySelector('select')?.focus(); }, 'text', data.instances.map(i => [i.id, `${i.characterName} / ${i.playerName}`])));
      if (selectedInstance) root.append(node('h2', selectedInstance.characterName), node('p', selectedInstance.playerName), node('div', selectedInstance.details, { class: 'casting-prose' }));
      if (!updateOnly && data.accessMode !== 'gm-bearer') root.append(field('Recipient', recipientId, v => { recipientId = v; render(); }, 'text', [['', 'Select verified recipient'], ...data.recipients.map(r => [r.id, r.name])]));
      root.append(node('p', data.accessMode === 'gm-bearer' ? 'Anyone holding this link can view this exact snapshot. It never grants editing. Later draft edits remain private.' : 'Publish this exact snapshot to the selected recipient. Later draft edits remain private.'));
      if (!updateOnly) root.append(button(data.accessMode === 'gm-bearer' ? 'Publish view-only dossier link' : 'Publish dossier to recipient', () => action(async () => {
        const result = await request('assign', { responseId: selectedResponse.id, instanceId: selectedInstance.id, ...(data.accessMode === 'gm-bearer' ? {} : {recipientId}), expectedResponseRevision: selectedResponse.revision, expectedInstanceRevision: selectedInstance.revision }); shareLink = `#dossier/${result.handle}`;
        data = await loadOwner(); const current = data.responses.find(r => r.id === selectedResponse.id && r.handle === result.handle); if (!current) { shareLink = ''; throw new Error('unavailable'); } selectedResponse = current;
      }, 'Recipient snapshot published.'), (data.accessMode !== 'gm-bearer' && !recipientId) || !selectedInstance));
      if (updateOnly) root.append(button('Publish updated snapshot', () => action(async () => {
        await request('publishDossierUpdate', { responseId: selectedResponse.id, expectedInstanceId: selectedInstance.id, expectedResponseRevision: selectedResponse.revision, expectedInstanceRevision: selectedInstance.revision });
        data = await loadOwner(); selectedResponse = data.responses.find(r => r.id === selectedResponse.id);
      }, 'Updated recipient snapshot published.')));
      if (shareLink) root.append(node('a', 'Open recipient dossier link', { href: shareLink, referrerpolicy: 'no-referrer' }));
    }
    if (screen === 'revoke') {
      root.append(heading('Revoke recipient access'), node('p', 'This immediately disables the active dossier link. Downloaded copies cannot be recalled. The response and private character draft remain.'), button('Cancel revocation', () => navigate('responses')), button('Confirm revocation', () => action(async () => {
        await request('revoke', { responseId: selectedResponse.id, expectedResponseRevision: selectedResponse.revision }); data = await loadOwner(); screen = 'responses'; shareLink = '';
      }, 'Recipient access revoked.')));
    }
    if (screen === 'characters') {
      root.append(heading('Character instances'), node('p', 'Up to three distinct instances per character template. Editing an instance keeps recipient snapshots unchanged.'));
      for (const instance of data.instances) {
        const group = node('fieldset'); group.append(node('legend', `${instance.characterName} / ${instance.playerName}`)); if (!characterDrafts.has(instance.id)) characterDrafts.set(instance.id, structuredClone(instance)); const editing = characterDrafts.get(instance.id);
        group.append(field('Player name', editing.playerName, v => { editing.playerName = v; }), field('Character name', editing.characterName, v => { editing.characterName = v; }), field('Details', editing.details, v => { editing.details = v; }, 'textarea'));
        group.append(button('Save character draft', () => action(async () => { await request('updateInstance', { instanceId: instance.id, expectedRevision: instance.revision, details: editing }); characterDrafts.delete(instance.id); data = await loadOwner(); }, 'Character draft saved.'))); root.append(group);
      }
    }
    if (screen === 'characters') {
      root.append(node('h2', 'Author a character template'), field('New template name', newTemplate.name, v => { newTemplate.name = v; }), field('New template details', newTemplate.details, v => { newTemplate.details = v; }, 'textarea'), button('Create character template', () => action(async () => { const template = await request('createTemplate', newTemplate); newTemplateId = template.id; newTemplate = { name: '', details: '' }; data = await loadOwner(); }, 'New character template created.')));
      newTemplateId ||= data.templates?.[0]?.id ?? '';
      root.append(node('h2', 'Create a distinct instance'), field('Character template', newTemplateId, v => { newTemplateId = v; }, 'text', (data.templates ?? []).map(t => [t.id, t.name])), field('New player name', newCharacter.playerName, v => { newCharacter.playerName = v; }), field('New character name', newCharacter.characterName, v => { newCharacter.characterName = v; }), field('New character details', newCharacter.details, v => { newCharacter.details = v; }, 'textarea'), button('Create character instance', () => action(async () => {
        await request('createInstance', { templateId: newTemplateId, details: newCharacter }); newCharacter = { playerName: '', characterName: '', details: '' }; data = await loadOwner();
      }, 'Distinct character instance created.'), !newTemplateId));
    }
    if (screen === 'settings') root.append(heading('Settings'), node('p', data.accessMode === 'gm-bearer' ? 'Anyone holding a dossier link can view its published snapshot. Editing and response review require current GM authority for the associated session. No automatic deletion.' : 'Legacy synthetic regression fixture: recipient accounts and old owner membership. This surface is not the selected session/bearer flow.'), button('Replay flag intro', event => { returnFocus = event.currentTarget; activeIntro = true; showIntro(); }));
    if (notice) root.append(node('p', notice, { role: 'status', 'aria-live': 'polite' }));
    if (error) root.append(node('p', error, { role: 'alert' }));
    if (busy) for (const control of root.querySelectorAll('button,input,select,textarea')) control.disabled = true;
    if (activeIntro) showIntro();
  }
  render();
  const loadEpoch = epoch;
  Promise.resolve().then(async () => {
    try {
      if (route.name === 'dossier') data = { dossier: await read('dossier', route.handle) };
      else if (route.name === 'form') data = await read('publicForm', route.handle);
      else { data = await loadOwner(); if (!data.prerequisite) draft = structuredClone(data.definition); }
    } catch { error = 'Unavailable. This published link may have been revoked; ask the GM for a current link.'; }
    if (!disposed && epoch === loadEpoch) { render(); if (focusAfterLoad) { root.querySelector('h1')?.focus(); focusAfterLoad = false; } }
  });
  return { invalidateSession, dispose() { disposed = true; epoch++; win.clearTimeout(introTimer); attempts.clear(); characterDrafts.clear(); root.replaceChildren(); } };
}
