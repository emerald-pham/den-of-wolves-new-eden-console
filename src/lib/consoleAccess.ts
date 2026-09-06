import { createContext, useContext } from 'react';

/** Viewing a console never changes the server-owned command assignment. */
export const ConsoleAccessContext = createContext<{ writable: boolean; roleId?: string }>({ writable: true });
export const useConsoleAccess = () => useContext(ConsoleAccessContext);
