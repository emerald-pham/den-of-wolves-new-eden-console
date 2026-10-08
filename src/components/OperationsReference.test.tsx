import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import OperationsReference from './OperationsReference';

it('starts closed, retains the full reference and exposes the controlled region', async () => {
  render(<OperationsReference><a href="#unique-rule">Unique reference rule</a></OperationsReference>);
  const toggle = screen.getByRole('button', { name: 'Operations reference' });
  expect(toggle).toHaveAttribute('type', 'button');
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  const body = document.getElementById(toggle.getAttribute('aria-controls')!);
  expect(body).not.toBeVisible();
  expect(body).toHaveTextContent('Unique reference rule');
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  await userEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(body).toBeVisible();
  expect(toggle).toHaveFocus();
  expect(toggle).toHaveTextContent('Close');
  await userEvent.click(toggle);
  expect(toggle).toHaveTextContent('Open');
  expect(body).not.toBeVisible();
  expect(toggle).toHaveFocus();
});

it.each(['{Enter}', ' '])('opens with %s and returns focus from reference content on Escape', async key => {
  const user = userEvent.setup();
  render(<OperationsReference><a href="#rule">Reference detail</a></OperationsReference>);
  const toggle = screen.getByRole('button', { name: 'Operations reference' });
  toggle.focus();
  await user.keyboard(key);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await user.tab();
  expect(screen.getByRole('link')).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(toggle).toHaveFocus();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});

it('retains open state during content updates and starts closed after a fresh mount', async () => {
  const view = render(<OperationsReference><p>Initial rule</p></OperationsReference>);
  const toggle = screen.getByRole('button', { name: 'Operations reference' });
  await userEvent.click(toggle);
  const controls = toggle.getAttribute('aria-controls');
  view.rerender(<OperationsReference><p>Current conditional rule</p></OperationsReference>);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(toggle).toHaveAttribute('aria-controls', controls);
  expect(screen.getByText('Current conditional rule')).toBeVisible();
  view.unmount();
  render(<OperationsReference><p>Returned reference</p></OperationsReference>);
  expect(screen.getByRole('button', { name: 'Operations reference' })).toHaveAttribute('aria-expanded', 'false');
});

it('gives simultaneous disclosures distinct control targets and preserves reading order', () => {
  render(<><OperationsReference><p>First reference</p></OperationsReference><OperationsReference><p>Second reference</p></OperationsReference></>);
  const [first, second] = screen.getAllByRole('button', { name: 'Operations reference' });
  expect(first!.getAttribute('aria-controls')).not.toEqual(second!.getAttribute('aria-controls'));
  const body = document.getElementById(first!.getAttribute('aria-controls')!)!;
  expect(first!.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
