import Link from "next/link";
import { recupererMesConversations } from "@/lib/messagerie-serveur";
import BadgeVerifie from "@/components/badge-verifie";

export default async function MessagesPage() {
  const conversations = await recupererMesConversations();

  return (
    <main className="flex-1 bg-ink px-6 py-10 text-parchment">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="font-playfair text-2xl font-semibold tracking-[.07em]">
          Messages
        </h1>

        {conversations.length === 0 ? (
          <div className="mt-6 rounded-card border border-line bg-ink-2 p-10 text-center">
            <p className="text-sm text-muted">
              Aucune conversation pour l&apos;instant. Une conversation ne
              s&apos;ouvre qu&apos;autour d&apos;une marchandise.
            </p>
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-line rounded-card border border-line bg-ink-2">
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <Link
                  href={`/messages/${conversation.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-ink"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-parchment">
                      {conversation.marchandiseTitre}
                    </p>
                    <p className="mt-1 truncate text-sm text-muted">
                      {conversation.dernierMessageApercu ??
                        "Aucun message pour l'instant."}
                    </p>
                  </div>
                  {conversation.interlocuteurVerifie && (
                    <div className="shrink-0">
                      <BadgeVerifie />
                    </div>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
