import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type Message = {
  id: string;
  conversation_id: string;
  expediteur_id: string;
  contenu: string;
  created_at: string;
};

export type ConversationListItem = {
  id: string;
  marchandiseId: string;
  marchandiseTitre: string;
  dernierMessageApercu: string | null;
  dernierMessageLe: string | null;
  interlocuteurVerifie: boolean;
};

export type ConversationDetail = {
  id: string;
  marchandiseId: string;
  marchandiseTitre: string;
  estParticipant: boolean;
  interlocuteurVerifie: boolean;
  messages: Message[];
};

const COLONNES_MESSAGE = "id, conversation_id, expediteur_id, contenu, created_at";

// Un membre normal ne peut lire, via RLS, que sa PROPRE ligne dans
// "abonnes" — impossible de vérifier le statut d'un autre membre avec
// le client authentifié. On utilise donc ici le client admin, mais
// UNIQUEMENT pour calculer ce booléen : on ne sélectionne jamais
// l'e-mail ni aucune autre colonne, rien d'autre ne remonte jamais au
// client.
async function estMembreVerifie(userId: string): Promise<boolean> {
  const admin = createAdminClient();

  const { data: estAdmin } = await admin
    .from("admins")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (estAdmin) return true;

  const { data: abonne } = await admin
    .from("abonnes")
    .select("statut")
    .eq("id", userId)
    .maybeSingle();

  return abonne?.statut === "actif";
}

function extraireTitre(marchandises: unknown): string {
  if (Array.isArray(marchandises)) {
    return (marchandises[0] as { titre?: string } | undefined)?.titre ?? "Marchandise";
  }
  return (marchandises as { titre?: string } | null)?.titre ?? "Marchandise";
}

// Mes conversations (en tant qu'acheteur OU vendeur) — jamais celles
// des autres, même pour un admin : cette liste reste personnelle. La
// vue globale de modération se fait via l'ouverture directe d'une
// conversation par son URL, pas ici.
export async function recupererMesConversations(): Promise<ConversationListItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: conversations } = await supabase
    .from("conversations")
    .select(
      "id, marchandise_id, acheteur_id, vendeur_id, dernier_message_le, marchandises (titre)"
    )
    .or(`acheteur_id.eq.${user.id},vendeur_id.eq.${user.id}`)
    .order("dernier_message_le", { ascending: false, nullsFirst: false });

  if (!conversations || conversations.length === 0) return [];

  const ids = conversations.map((c) => c.id);
  const { data: messages } = await supabase
    .from("messages")
    .select(COLONNES_MESSAGE)
    .in("conversation_id", ids)
    .order("created_at", { ascending: false });

  const dernierMessageParConversation = new Map<string, string>();
  for (const message of (messages as Message[] | null) ?? []) {
    if (!dernierMessageParConversation.has(message.conversation_id)) {
      dernierMessageParConversation.set(message.conversation_id, message.contenu);
    }
  }

  return Promise.all(
    conversations.map(async (conversation) => {
      const interlocuteurId =
        conversation.acheteur_id === user.id
          ? conversation.vendeur_id
          : conversation.acheteur_id;

      return {
        id: conversation.id,
        marchandiseId: conversation.marchandise_id,
        marchandiseTitre: extraireTitre(conversation.marchandises),
        dernierMessageApercu: dernierMessageParConversation.get(conversation.id) ?? null,
        dernierMessageLe: conversation.dernier_message_le,
        interlocuteurVerifie: await estMembreVerifie(interlocuteurId),
      };
    })
  );
}

// Une conversation avec ses messages. La RLS gère l'accès : les 2
// participants, ou un admin qui l'ouvre via son URL directe (pas de
// liste globale — voir recupererMesConversations ci-dessus).
export async function recupererConversationAvecMessages(
  id: string
): Promise<ConversationDetail | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, marchandise_id, acheteur_id, vendeur_id, marchandises (titre)")
    .eq("id", id)
    .maybeSingle();

  if (!conversation) return null;

  const { data: messages } = await supabase
    .from("messages")
    .select(COLONNES_MESSAGE)
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  const estParticipant =
    conversation.acheteur_id === user.id || conversation.vendeur_id === user.id;

  // Un admin peut ouvrir une conversation dont il n'est ni l'acheteur
  // ni le vendeur (modération) : dans ce cas il n'y a pas UN
  // "interlocuteur" unique de son point de vue, donc pas de badge à
  // calculer pour lui — la page affichera une mention "vue admin" à
  // la place.
  const interlocuteurId = estParticipant
    ? conversation.acheteur_id === user.id
      ? conversation.vendeur_id
      : conversation.acheteur_id
    : null;

  return {
    id: conversation.id,
    marchandiseId: conversation.marchandise_id,
    marchandiseTitre: extraireTitre(conversation.marchandises),
    estParticipant,
    interlocuteurVerifie: interlocuteurId ? await estMembreVerifie(interlocuteurId) : false,
    messages: (messages as Message[] | null) ?? [],
  };
}
