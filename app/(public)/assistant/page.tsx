import { ClientChat } from "@/components/assistant/client-chat";

export default function AssistantPage() {
  return (
    <section className="assistant-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Kiln Studio</p>
          <h1>A helping hand</h1>
          <p>
            Ask about our services, fictional concept work, or how to use the
            project inquiry form.
          </p>
        </div>
      </header>
      <ClientChat />
    </section>
  );
}
