"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AUTO_ADVANCE_STORAGE_PREFIX,
  DEFAULT_AUTO_ADVANCE_DELAY_MS,
  autoAdvanceStorageKey,
  isAutoAdvanceDelay,
  parseAutoAdvanceDelay,
  type AutoAdvanceDelay,
} from "@/lib/auto-advance";
import {
  getSessionId,
  SESSION_CHANGE_EVENT,
} from "@/lib/session";
import { authedFetch } from "@/lib/session-client";

type AutoAdvancePreferenceContextValue = {
  delay: AutoAdvanceDelay;
  isLoading: boolean;
  isSaving: boolean;
  syncError: string | null;
  setDelay: (delay: AutoAdvanceDelay) => void;
};

const AutoAdvancePreferenceContext =
  createContext<AutoAdvancePreferenceContextValue | null>(null);

const AUTO_ADVANCE_PENDING_PREFIX = "iiqe:autoAdvance:pending:";
const AUTO_ADVANCE_LOCK_NAME = "iiqe:autoAdvance:write";

function readLocalPreference(sessionId: string): AutoAdvanceDelay {
  try {
    const raw = localStorage.getItem(autoAdvanceStorageKey(sessionId));
    if (raw == null) return DEFAULT_AUTO_ADVANCE_DELAY_MS;
    return parseAutoAdvanceDelay(JSON.parse(raw));
  } catch {
    return DEFAULT_AUTO_ADVANCE_DELAY_MS;
  }
}

function writeLocalPreference(sessionId: string, delay: AutoAdvanceDelay) {
  try {
    localStorage.setItem(
      autoAdvanceStorageKey(sessionId),
      JSON.stringify(delay),
    );
  } catch {
    // localStorage 可能被禁用；仍保留目前頁面的記憶體狀態。
  }
}

function readPendingPreference(sessionId: string): AutoAdvanceDelay | null {
  try {
    const raw = localStorage.getItem(
      AUTO_ADVANCE_PENDING_PREFIX + sessionId,
    );
    if (raw == null) return null;
    return parseAutoAdvanceDelay(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writePendingPreference(
  sessionId: string,
  delay: AutoAdvanceDelay | null,
): void {
  try {
    const key = AUTO_ADVANCE_PENDING_PREFIX + sessionId;
    if (delay == null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(delay));
    }
  } catch {
    // localStorage 不可用時只保留記憶體狀態。
  }
}

async function runWithLock<T>(
  name: string,
  task: () => Promise<T>,
): Promise<T> {
  const locks = (globalThis as { navigator?: { locks?: { request: (name: string, cb: () => Promise<T>) => Promise<T> } } })
    .navigator?.locks;
  if (locks?.request) {
    return locks.request(name, task);
  }
  return task();
}

export function AutoAdvancePreferenceProvider({ children }: { children: ReactNode }) {
  const [delay, setDelayState] = useState<AutoAdvanceDelay>(DEFAULT_AUTO_ADVANCE_DELAY_MS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const sessionIdRef = useRef("");
  const loadVersionRef = useRef(0);
  const saveVersionRef = useRef(0);

  const loadPreference = useCallback(async (sessionId: string) => {
    const loadVersion = ++loadVersionRef.current;
    sessionIdRef.current = sessionId;
    setDelayState(readLocalPreference(sessionId));
    setSyncError(null);
    setIsLoading(true);

    try {
      const response = await authedFetch("/api/preferences");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as {
        sessionId?: unknown;
        exists?: unknown;
        autoAdvanceDelayMs?: unknown;
      };
      if (loadVersion !== loadVersionRef.current) return;
      if (data.sessionId !== sessionId) return;
      const local = readLocalPreference(sessionId);
      if (data.exists === false) {
        setDelayState(local);
        const pending = readPendingPreference(sessionId) ?? local;
        runWithLock(AUTO_ADVANCE_LOCK_NAME, async () => {
          if (loadVersion !== loadVersionRef.current) return;
          if (sessionIdRef.current !== sessionId) return;
          try {
            const saveResponse = await authedFetch("/api/preferences", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ autoAdvanceDelayMs: pending }),
            });
            if (!saveResponse.ok) throw new Error(`HTTP ${saveResponse.status}`);
            const saved = (await saveResponse.json()) as { sessionId?: unknown };
            if (saved.sessionId !== sessionId) throw new Error("session mismatch");
            writePendingPreference(sessionId, null);
          } catch (error) {
            setSyncError(
              error instanceof Error ? error.message : "同步失敗",
            );
          }
        });
        return;
      }
      const next = parseAutoAdvanceDelay(data.autoAdvanceDelayMs);
      setDelayState(next);
      writeLocalPreference(sessionId, next);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "無法讀取偏好");
    } finally {
      if (loadVersion === loadVersionRef.current) setIsLoading(false);
    }
  }, []);

  const flushPending = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    const pending = readPendingPreference(sessionId);
    if (pending == null) return;
    await runWithLock(AUTO_ADVANCE_LOCK_NAME, async () => {
      if (sessionIdRef.current !== sessionId) return;
      try {
        const response = await authedFetch("/api/preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ autoAdvanceDelayMs: pending }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as { sessionId?: unknown };
        if (data.sessionId !== sessionId) throw new Error("session mismatch");
        writePendingPreference(sessionId, null);
        setSyncError(null);
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : "同步失敗");
      }
    });
  }, []);

  useEffect(() => {
    void loadPreference(getSessionId());

    const handleSessionChange = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string }>).detail;
      void loadPreference(detail?.id || getSessionId());
    };
    const handleStorage = (event: StorageEvent) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId || event.key !== autoAdvanceStorageKey(sessionId)) return;
      setDelayState(readLocalPreference(sessionId));
      void flushPending();
    };

    window.addEventListener(SESSION_CHANGE_EVENT, handleSessionChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      loadVersionRef.current += 1;
      saveVersionRef.current += 1;
      window.removeEventListener(SESSION_CHANGE_EVENT, handleSessionChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, [flushPending, loadPreference]);

  const setDelay = useCallback((next: AutoAdvanceDelay) => {
    if (!isAutoAdvanceDelay(next)) return;
    const sessionId = sessionIdRef.current || getSessionId();
    const saveVersion = ++saveVersionRef.current;
    setDelayState(next);
    writeLocalPreference(sessionId, next);
    writePendingPreference(sessionId, next);
    setSyncError(null);
    setIsSaving(true);

    runWithLock(AUTO_ADVANCE_LOCK_NAME, async () => {
      if (saveVersion !== saveVersionRef.current) return;
      if (sessionIdRef.current !== sessionId) return;
      try {
        const response = await authedFetch("/api/preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ autoAdvanceDelayMs: next }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as { sessionId?: unknown };
        if (data.sessionId !== sessionId) throw new Error("session mismatch");
        writePendingPreference(sessionId, null);
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : "同步失敗");
      } finally {
        if (saveVersion === saveVersionRef.current) setIsSaving(false);
      }
    });
  }, []);

  const value = useMemo<AutoAdvancePreferenceContextValue>(
    () => ({ delay, isLoading, isSaving, syncError, setDelay }),
    [delay, isLoading, isSaving, syncError, setDelay],
  );

  return (
    <AutoAdvancePreferenceContext.Provider value={value}>
      {children}
    </AutoAdvancePreferenceContext.Provider>
  );
}

export function useAutoAdvancePreference(): AutoAdvancePreferenceContextValue {
  const context = useContext(AutoAdvancePreferenceContext);
  if (!context) {
    throw new Error("useAutoAdvancePreference 必須在 <AutoAdvancePreferenceProvider> 內使用");
  }
  return context;
}

export { AUTO_ADVANCE_STORAGE_PREFIX };