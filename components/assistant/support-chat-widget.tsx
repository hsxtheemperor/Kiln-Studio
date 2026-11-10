"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { ClientChat } from "./client-chat";

export function SupportChatWidget() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  if (pathname === "/assistant") {
    return null;
  }

  return (
    <aside className="support-chat-widget">
      <section
        id="support-chat-panel"
        className="support-chat-panel"
        role="dialog"
        aria-modal="false"
        aria-labelledby="support-chat-title"
        hidden={!isOpen}
      >
        <header className="support-chat-header">
          <div>
            <p className="eyebrow">Kiln Studio · Demo guide</p>
            <h2 id="support-chat-title">A helping hand</h2>
          </div>
          <button
            className="support-chat-close"
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Close chat"
          >
            ×
          </button>
        </header>
        <ClientChat compact />
      </section>
      <button
        className="support-chat-toggle"
        type="button"
        aria-expanded={isOpen}
        aria-controls="support-chat-panel"
        onClick={() => setIsOpen((open) => !open)}
      >
        {isOpen ? "Close guide" : "Need a hand?"}
      </button>
    </aside>
  );
}
