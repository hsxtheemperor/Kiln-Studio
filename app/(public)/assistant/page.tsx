import { ClientChat } from "@/components/assistant/client-chat";

export default function AssistantPage() {
  return (
    <section className="assistant-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Kiln Studio</p>
          <h1>Ask the studio</h1>
          <p>Get quick answers about the demo studio and starting a project.</p>
        </div>
      </header>
      <ClientChat />
    </section>
  );
}
