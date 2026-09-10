"use client";

import { useEffect, useRef, useState } from "react";
import ChampTexte from "@/components/champ-texte";
import BoutonPrimaire from "@/components/bouton-primaire";
import { envoyerMessage, obtenirMessages } from "../actions";
import type { Message } from "@/lib/messagerie-serveur";

type FilConversationProps = {
  conversationId: string;
  monId: string;
  messagesInitiaux: Message[];
};

export default function FilConversation({
  conversationId,
  monId,
  messagesInitiaux,
}: FilConversationProps) {
  const [messages, setMessages] = useState<Message[]>(messagesInitiaux);
  const [contenu, setContenu] = useState("");
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement>(null);

  // Polling léger — même mécanique que /paiement-en-attente — pour
  // voir arriver les nouveaux messages sans rien de plus compliqué.
  useEffect(() => {
    const intervalle = setInterval(async () => {
      const frais = await obtenirMessages(conversationId);
      setMessages(frais);
    }, 4000);
    return () => clearInterval(intervalle);
  }, [conversationId]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function gererEnvoi(e: React.FormEvent) {
    e.preventDefault();
    const texte = contenu.trim();
    if (!texte) return;

    setEnvoiEnCours(true);
    setErreur(null);

    const resultat = await envoyerMessage(conversationId, texte);

    if (!resultat.succes) {
      setErreur(resultat.erreur);
      setEnvoiEnCours(false);
      return;
    }

    setContenu("");
    const frais = await obtenirMessages(conversationId);
    setMessages(frais);
    setEnvoiEnCours(false);
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="mt-4 max-h-[55vh] flex-1 space-y-3 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-dim">
            Aucun message pour l&apos;instant — lance la conversation.
          </p>
        ) : (
          messages.map((message) => {
            const estMoi = message.expediteur_id === monId;
            return (
              <div
                key={message.id}
                className={`flex ${estMoi ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-card px-4 py-2.5 text-sm ${
                    estMoi
                      ? "bg-accent text-ink"
                      : "border border-line bg-ink-2 text-parchment"
                  }`}
                >
                  {message.contenu}
                </div>
              </div>
            );
          })
        )}
        <div ref={finRef} />
      </div>

      {erreur && (
        <p className="mt-3 rounded-brand border border-red-900 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
          {erreur}
        </p>
      )}

      <form
        onSubmit={gererEnvoi}
        className="mt-4 flex items-end gap-2 border-t border-line pt-4"
      >
        <div className="flex-1">
          <ChampTexte
            id="message"
            aria-label="Message"
            placeholder="Écris ton message..."
            value={contenu}
            onChange={(e) => setContenu(e.target.value)}
          />
        </div>
        <BoutonPrimaire type="submit" disabled={envoiEnCours}>
          {envoiEnCours ? "..." : "Envoyer"}
        </BoutonPrimaire>
      </form>
    </div>
  );
}
