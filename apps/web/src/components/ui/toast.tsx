import { createContext, useContext, useState, type ReactNode } from "react";

type Tone = "ok" | "err";
type Toast = { id: number; tone: Tone; text: string };

const ToastContext = createContext<(text: string, tone?: Tone) => void>(() => undefined);

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  function push(text: string, tone: Tone = "ok") {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setItems((current) => [...current.slice(-3), { id, tone, text }]);
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, 3200);
  }

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[min(22rem,calc(100%-2rem))] flex-col gap-2">
        {items.map((item) => (
          <p
            key={item.id}
            role={item.tone === "err" ? "alert" : "status"}
            className={`rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${item.tone === "err" ? "bg-red-700 text-white" : "bg-emerald-800 text-white"}`}
          >
            {item.text}
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
