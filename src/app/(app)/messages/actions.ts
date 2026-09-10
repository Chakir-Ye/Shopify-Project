"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Message } from "@/lib/messagerie-serveur";

type ResultatContact =
  | { succes: true; conversationId: string }
  | { succes: false; erreur: string };

// Retrouve la conversation existante (contrainte unique
// marchandise+acheteur) ou en crée une. Utilise le client authentifié
// partout : la policy RLS d'insertion revérifie déjà tout ce qu'il
// faut (acheteur actif-ou-admin, marchandise publiée, vendeur
// actif-ou-admin) — les vérifications ci-dessous ne sont qu'un
// filet pour un message d'erreur clair, pas la vraie barrière.
export async function contacterVendeur(marchandiseId: string): Promise<ResultatContact> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { succes: false, erreur: "Tu dois être connecté." };
  }

  const { data: marchandise } = await supabase
    .from("marchandises")
    .select("id, vendeur_id, statut")
    .eq("id", marchandiseId)
    .maybeSingle();

  if (!marchandise || marchandise.statut !== "publiee") {
    return { succes: false, erreur: "Cette marchandise n'est plus disponible." };
  }
  if (marchandise.vendeur_id === user.id) {
    return { succes: false, erreur: "Tu ne peux pas contacter ta propre annonce." };
  }

  const { data: existante } = await supabase
    .from("conversations")
    .select("id")
    .eq("marchandise_id", marchandiseId)
    .eq("acheteur_id", user.id)
    .maybeSingle();

  if (existante) {
    return { succes: true, conversationId: existante.id };
  }

  const { data: nouvelle, error } = await supabase
    .from("conversations")
    .insert({
      marchandise_id: marchandiseId,
      acheteur_id: user.id,
      vendeur_id: marchandise.vendeur_id,
    })
    .select("id")
    .single();

  if (error || !nouvelle) {
    return {
      succes: false,
      erreur: `Impossible de démarrer la conversation : ${
        error?.message ?? "erreur inconnue"
      }.`,
    };
  }

  revalidatePath("/messages");

  return { succes: true, conversationId: nouvelle.id };
}

type ResultatEnvoi = { succes: true } | { succes: false; erreur: string };

export async function envoyerMessage(
  conversationId: string,
  contenu: string
): Promise<ResultatEnvoi> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { succes: false, erreur: "Tu dois être connecté." };
  }

  const texte = contenu.trim();
  if (!texte) {
    return { succes: false, erreur: "Le message ne peut pas être vide." };
  }

  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    expediteur_id: user.id,
    contenu: texte,
  });

  if (error) {
    return {
      succes: false,
      erreur: `Impossible d'envoyer le message : ${error.message}.`,
    };
  }

  revalidatePath(`/messages/${conversationId}`);
  revalidatePath("/messages");

  return { succes: true };
}

// Utilisée par le polling léger côté client (comme /paiement-en-attente).
export async function obtenirMessages(conversationId: string): Promise<Message[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select("id, conversation_id, expediteur_id, contenu, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  return (data as Message[] | null) ?? [];
}
