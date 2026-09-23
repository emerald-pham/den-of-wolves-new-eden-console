import React from 'react';
import { createRoot } from 'react-dom/client';
import FleetTicker, { type FleetTickerProps } from '../src/components/FleetTicker';

export function mountTickerLifecycleHarness(hostId: string): (props: FleetTickerProps) => void {
  const host = document.getElementById(hostId);
  if (!host) throw new Error(`Ticker lifecycle host not found: ${hostId}`);
  const root = createRoot(host);
  return (props) => root.render(React.createElement(FleetTicker, props));
}
