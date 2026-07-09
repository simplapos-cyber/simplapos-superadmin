import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { SSEConnectionStatus } from "@/hooks/useSSE";

interface SSEStatusContextValue {
  status: SSEConnectionStatus;
  retryCount: number;
  setStatus: (status: SSEConnectionStatus) => void;
  setRetryCount: (count: number) => void;
}

const SSEStatusContext = createContext<SSEStatusContextValue>({
  status: "disconnected",
  retryCount: 0,
  setStatus: () => {},
  setRetryCount: () => {},
});

export function SSEStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatusState] = useState<SSEConnectionStatus>("disconnected");
  const [retryCount, setRetryCountState] = useState(0);

  const setStatus = useCallback((s: SSEConnectionStatus) => setStatusState(s), []);
  const setRetryCount = useCallback((c: number) => setRetryCountState(c), []);

  return (
    <SSEStatusContext.Provider value={{ status, retryCount, setStatus, setRetryCount }}>
      {children}
    </SSEStatusContext.Provider>
  );
}

export function useSSEStatus() {
  return useContext(SSEStatusContext);
}
