import type { Plugin } from 'vite';
export interface LocalGmAccessConfiguration { projectId: string; authPort: number; firestorePort: number }
export function localGmAccessConfiguration(command: string, env: Record<string, string>): LocalGmAccessConfiguration | null;
export function localGmAccessPlugin(config: LocalGmAccessConfiguration | null): Plugin;
