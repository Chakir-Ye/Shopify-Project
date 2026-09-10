-- ============================================================
-- SKY VANTAC — correctif : même bug de visibilité croisée que
-- migration-08, mais sur conversations/messages (Brique 5)
-- À copier-coller dans Supabase -> SQL Editor -> "New query" -> Run
-- (à exécuter APRÈS migration-07-messagerie.sql ET APRÈS
--  migration-08-visibilite-croisee.sql, qui crée le schéma "private"
--  et la fonction private.est_actif_ou_admin réutilisée ici)
-- ============================================================

-- ------------------------------------------------------------
-- Le bug
-- ------------------------------------------------------------
-- Exactement le même mécanisme que pour "marchandises" (voir
-- migration-08) : les policies de "conversations" et "messages"
-- vérifient "actif ou admin" via des exists directs sur
-- public.abonnes / public.admins. Ces deux tables sont elles-mêmes
-- protégées par RLS, et une sous-requête reste soumise à la RLS de la
-- table qu'elle interroge — même appelée depuis la policy d'une autre
-- table. Démarrer une conversation exige de vérifier le statut du
-- VENDEUR (quelqu'un d'autre que l'acheteur) : cette vérification ne
-- peut jamais réussir, d'où "new row violates row-level security
-- policy for table conversations" en cliquant "Contacter le vendeur".
--
-- Au passage, deux policies (lecture de conversations et de messages)
-- vérifient aussi "admin" tout seul pour la vue modération — même
-- problème : public.admins a RLS activée sans AUCUNE policy, donc le
-- exists échoue même pour la PROPRE ligne de l'admin qui se
-- connecte. La vue modération admin (ouvrir une conversation par son
-- URL directe) était donc, elle aussi, cassée depuis le début.
--
-- ------------------------------------------------------------
-- Deux fonctions différentes, pas une seule
-- ------------------------------------------------------------
-- private.est_actif_ou_admin(id) (migration-08) répond "cette
-- personne est-elle actif OU admin ?" — utilisé partout où
-- n'importe quel membre actif doit passer (démarrer une conversation,
-- envoyer un message).
--
-- Pour la vue modération, il faut au contraire un droit
-- STRICTEMENT réservé aux admins : un membre actif ordinaire ne doit
-- JAMAIS pouvoir lire une conversation à laquelle il ne participe
-- pas, seulement un admin qui modère. Réutiliser
-- est_actif_ou_admin(auth.uid()) ici serait une régression de
-- confidentialité (n'importe quel membre actif pourrait alors lire
-- n'importe quelle conversation via son URL). D'où une seconde
-- fonction, private.est_admin, strictement "admin uniquement".

create or replace function private.est_admin(cible_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.admins where id = cible_id
  );
$$;

revoke execute on function private.est_admin(uuid) from public;
grant execute on function private.est_admin(uuid) to authenticated;

-- ------------------------------------------------------------
-- Policies conversations
-- ------------------------------------------------------------
drop policy if exists "Participants ou admin voient la conversation" on public.conversations;
create policy "Participants ou admin voient la conversation"
  on public.conversations
  for select
  using (
    auth.uid() = acheteur_id
    or auth.uid() = vendeur_id
    or private.est_admin(auth.uid())
  );

drop policy if exists "Un acheteur actif demarre une conversation" on public.conversations;
create policy "Un acheteur actif demarre une conversation"
  on public.conversations
  for insert
  with check (
    auth.uid() = acheteur_id
    and private.est_actif_ou_admin(auth.uid())
    -- La marchandise visée doit être réellement publiée, par le même
    -- vendeur que celui déclaré, avec un vendeur actif-ou-admin — on
    -- ne peut pas démarrer une conversation sur une annonce qu'on ne
    -- devrait même pas pouvoir voir.
    and exists (
      select 1 from public.marchandises m
      where m.id = marchandise_id
        and m.vendeur_id = conversations.vendeur_id
        and m.statut = 'publiee'
        and private.est_actif_ou_admin(m.vendeur_id)
    )
  );

-- ------------------------------------------------------------
-- Policies messages
-- ------------------------------------------------------------
drop policy if exists "Participants ou admin lisent les messages" on public.messages;
create policy "Participants ou admin lisent les messages"
  on public.messages
  for select
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.acheteur_id = auth.uid() or c.vendeur_id = auth.uid())
    )
    or private.est_admin(auth.uid())
  );

drop policy if exists "Un participant actif envoie un message" on public.messages;
create policy "Un participant actif envoie un message"
  on public.messages
  for insert
  with check (
    auth.uid() = expediteur_id
    and private.est_actif_ou_admin(auth.uid())
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.acheteur_id = auth.uid() or c.vendeur_id = auth.uid())
    )
  );
