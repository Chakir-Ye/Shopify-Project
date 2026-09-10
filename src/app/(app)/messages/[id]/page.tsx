import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { recupererConversationAvecMessages } from "@/lib/messagerie-serveur";
import BadgeVerifie from "@/components/badge-verifie";
import FilConversation from "./fil-conversation";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    notFound();
  }

  const conversation = await recupererConversationAvecMessages(id);
  if (!conversation) {
    notFound();
  }

  return (
    <main className="flex flex-1 flex-col bg-ink px-6 py-8 text-parchment">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
        <div className="flex items-center justify-between gap-4 border-b border-line pb-4">
          <div className="min-w-0">
            <Link
              href={`/marchandises/${conversation.marchandiseId}`}
              className="font-playfair block truncate text-lg font-semibold tracking-[.05em] text-parchment hover:text-accent"
            >
              {conversation.marchandiseTitre}
            </Link>
            <p className="mt-1 text-xs uppercase tracking-[.1em] text-muted">
              Conversation
            </p>
          </div>
          {conversation.estParticipant ? (
            conversation.interlocuteurVerifie && <BadgeVerifie />
          ) : (
            <span className="shrink-0 rounded-brand border border-line px-2 py-1 text-xs text-dim">
              Vue admin (modération)
            </span>
          )}
        </div>

        <FilConversation
          conversationId={conversation.id}
          monId={user.id}
          messagesInitiaux={conversation.messages}
        />
      </div>
    </main>
  );
}
