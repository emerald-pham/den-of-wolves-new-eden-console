import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it } from 'vitest';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import * as ts from 'typescript';
import { useSessionStore } from '@/store/useSessionStore';
import RoleBrief from './RoleBrief';

// The installed algorithm publishes declarations for its CommonJS entry, but
// its ESM export omits that types mapping. Keep the native import typed here.
const { computeAccessibleName }: { computeAccessibleName: (element: Element, options: {
  computedStyleSupportsPseudoElements: boolean;
  getComputedStyle: typeof window.getComputedStyle;
}) => string } = createRequire(import.meta.url)('dom-accessibility-api');

/** JSDOM does not paint pseudo-elements. Read the issued CSS content and pass
 * only that computed-style gap to the accessible-name algorithm. This native
 * counterexample supports, rather than replaces, the actual Chrome evidence. */
function arrowAwareName(element: Element): string {
  const stylesheet = readFileSync('src/index.css', 'utf8');
  const rule = stylesheet.match(/\.session-mode__back::before\s*\{([^}]+)\}/)?.[1];
  const content = rule?.match(/content:\s*("[^"]*"|'[^']*')\s*;/)?.[1];
  expect(content).toBe('"←"');
  return computeAccessibleName(element, {
    computedStyleSupportsPseudoElements: true,
    getComputedStyle: (node, pseudo) => {
      if (!pseudo) return window.getComputedStyle(node);
      const style = document.createElement('span').style;
      style.setProperty('display', 'inline');
      style.setProperty('visibility', 'visible');
      style.setProperty('content', pseudo === '::before' && node.matches('.session-mode__back') ? content! : 'none');
      return style;
    },
  });
}

/** Render just App's actual private-brief lazy fallback JSX. Importing the full
 * App would create unrelated subscription fixtures and cannot force its cached
 * lazy import to remain pending. No application/store code is evaluated here. */
function privateBriefFallback(): React.ReactElement {
  const text = readFileSync('src/App.tsx', 'utf8');
  const source = ts.createSourceFile('src/App.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function findRoute(node: ts.Node): ts.JsxSelfClosingElement | undefined {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === 'Route' &&
      node.attributes.properties.some(attribute => ts.isJsxAttribute(attribute) &&
        attribute.name.getText(source) === 'path' && attribute.initializer &&
        ts.isStringLiteral(attribute.initializer) && attribute.initializer.text === '/brief')) return node;
    return ts.forEachChild(node, findRoute);
  }
  const route = findRoute(source);
  const element = route?.attributes.properties.find((attribute): attribute is ts.JsxAttribute =>
    ts.isJsxAttribute(attribute) && attribute.name.getText(source) === 'element');
  if (!element?.initializer || !ts.isJsxExpression(element.initializer) ||
    !element.initializer.expression || !ts.isJsxElement(element.initializer.expression)) {
    throw new Error('The existing private-brief route element must remain available.');
  }
  const suspense = element.initializer.expression;
  expect(suspense.openingElement.tagName.getText(source)).toBe('Suspense');
  const fallback = suspense.openingElement.attributes.properties.find((attribute): attribute is ts.JsxAttribute =>
    ts.isJsxAttribute(attribute) && attribute.name.getText(source) === 'fallback');
  if (!fallback?.initializer || !ts.isJsxExpression(fallback.initializer) || !fallback.initializer.expression) {
    throw new Error('The actual private-brief Suspense fallback must remain available.');
  }
  const compiled = ts.transpileModule(`const element = (${fallback.initializer.expression.getText(source)});`, {
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function('React', 'Link', `${compiled}\nreturn element;`)(React, Link) as React.ReactElement;
}

beforeEach(() => {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Table one', joinCode: '4821', phase: 'casting',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }, {
    uid: 'u1', sessionId: 's1', displayName: 'Player', role: 'player', seatId: null,
    assignedRoleId: 'doctor', joinedAt: '2026-01-01T00:00:00.000Z',
  });
  useSessionStore.getState().setRoleBrief({
    assignmentUid: 'u1', roleId: 'doctor', roleName: 'Doctor', vesselName: 'AEGIS',
    text: 'Keep your assignment private.', commonRules: 'Follow the current session rules.', setupRevision: 1,
  });
});

it('reproduces the actual CSS arrow name without an explicit label while keeping that arrow decorative', () => {
  render(<a href="/console" className="session-mode__back cic-text-button">Back to stations</a>);
  const back = screen.getByRole('link');
  expect(arrowAwareName(back)).toBe('← Back to stations');
  back.setAttribute('aria-label', 'Back to stations');
  expect(arrowAwareName(back)).toBe('Back to stations');
  expect(back.textContent).toBe('Back to stations');
  expect(back.getAttribute('href')).toBe('/console');
});

it.each(['loaded', 'waiting for the private brief', 'App Suspense fallback'] as const)(
  'keeps %s Back assistive name stable with the current arrow, text and ordinary return route', async state => {
    if (state === 'waiting for the private brief') {
      useSessionStore.getState().setRoleBrief(null, true);
    }
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/brief']}><Routes>
      <Route path="/brief" element={state === 'App Suspense fallback' ? privateBriefFallback() : <RoleBrief />} />
      <Route path="/console" element={<p>Station catalog</p>} />
    </Routes></MemoryRouter>);
    const back = screen.getByRole('link', { name: 'Back to stations' });
    expect(arrowAwareName(back)).toBe('Back to stations');
    expect(back).toHaveAttribute('aria-label', 'Back to stations');
    expect(back).toHaveClass('session-mode__back', 'cic-text-button');
    expect(back.textContent?.trim()).toBe('Back to stations');
    expect(back).toHaveAttribute('href', '/console');
    back.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByText('Station catalog')).toBeVisible();
    expect(useSessionStore.getState().me?.uid).toBe('u1');
    expect(useSessionStore.getState().me?.assignedRoleId).toBe('doctor');
  },
);
