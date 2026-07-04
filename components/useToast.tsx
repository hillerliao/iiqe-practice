"use client";

import { useState, useCallback, useEffect } from "react";

type ToastItem = {
  id: number;
  message: string;
};

let toastIdCounter = 0;

/**
 * 輕量 toast hook,不依賴任何外部套件。
 * 用法:
 *   const { toast, toasts } = useToast();
 *   toast("已複製");
 *   // 在元件樹底部渲染 <ToastContainer toasts={toasts} />
 */
export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, duration = 1500) => {
      const id = ++toastIdCounter;
      setToasts((prev) => [...prev, { id, message }]);
      setTimeout(() => remove(id), duration);
    },
    [remove]
  );

  return { toast, toasts };
}

export function ToastContainer({ toasts }: { toasts: ToastItem[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map((t) => (
        <ToastBubble key={t.id} item={t} />
      ))}
    </div>
  );
}

function ToastBubble({ item }: { item: ToastItem }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div
      className={`pointer-events-auto rounded-lg bg-zinc-900/95 text-white text-sm px-4 py-2 shadow-lg transition-all duration-200 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      }`}
    >
      {item.message}
    </div>
  );
}
