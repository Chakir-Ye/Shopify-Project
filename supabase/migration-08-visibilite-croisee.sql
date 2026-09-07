-- ============================================================
-- SKY VANTAC — correctif : visibilité croisée cassée sur /marchandises
-- À copier-coller dans Supabase -> SQL Editor -> "New query" -> Run
-- (à exécuter APRÈS toutes les migrations précédentes)
-- ============================================================

-- ------------------------------------------------------------
-- Le bug
-- ------------------------------------------------------------
-- Les policies de lecture de "marchandises" (et de "storage.objects")
-- vérifient "le vendeur est actif ou admin" via un
-- exists (select 1 from public.abonnes where ...) / (... from public.admins where ...).
--
-- Problème : "abonnes" et "admins" sont eux-mêmes protégés par RLS
-- ("Un utilisateur voit son propre statut" -> auth.uid() = id pour
-- abonnes ; RLS activée sans AUCUNE policy pour admins, donc accès
-- refusé par défaut à tout le monde y compris pour sa propre ligne).
-- Une sous-requête reste soumise à la RLS de la table qu'elle
-- interroge, même appelée depuis la policy d'une AUTRE table. Donc
-- quand Bangi regarde une annonce de l'admin, la sous-requête
-- "abonnes where id = <id de l'admin>" est filtrée par la RLS
-- d'abonnes à "id = auth.uid()" (Bangi) -> la ligne de l'admin est
-- introuvable -> la branche "vendeur actif/admin" échoue toujours
-- pour un vendeur qui n'est pas soi-même. Il ne reste alors que la
-- policy "un vendeur voit ses propres marchandises" : chacun ne voit
-- que ses propres annonces, jamais celles des autres membres.
--
-- Le correctif : remplacer ces sous-requêtes directes par un appel à
-- une fonction SECURITY DEFINER. Une telle fonction s'exécute avec
-- les droits de son propriétaire (le rôle qui possède les tables),
-- qui n'est pas soumis à la RLS par défaut (sauf si FORCE ROW LEVEL
-- SECURITY est activé sur la table, ce qui n'est le cas nulle part
-- ici) — elle peut donc vérifier "actif ou admin" pour N'IMPORTE
-- QUEL id, indépendamment de qui pose la question.
--
-- Confidentialité : cette fonction ne recrée AUCUN annuaire de
-- membres, parce qu'elle ne renvoie qu'un simple booléen ("cet id
-- précis est-il actif ou admin ?") pour un id qu'on lui fournit déjà
-- — elle ne permet ni de lister, ni de parcourir, ni de retrouver un
-- membre à partir de son nom/e-mail. Elle est en plus placée dans un
-- schéma "private" qui n'est PAS exposé par l'API Supabase (Data
-- API), donc injoignable directement depuis le navigateur (pas de
-- endpoint RPC public) : elle n'est utilisable que depuis l'intérieur
-- de Postgres, par les policies RLS elles-mêmes.

-- ------------------------------------------------------------
-- 1. Schéma privé (non exposé par l'API Supabase) + fonction
-- ------------------------------------------------------------
create schema if not exists private;

-- Nécessaire pour que le rôle authenticated puisse RÉSOUDRE la
-- fonction ci-dessous quand elle est appelée depuis une policy RLS.
-- Ça ne rend PAS le schéma "private" accessible depuis le navigateur :
-- seule l'API Supabase (PostgREST) expose des tables/fonctions au
-- public, et "private" n'est pas dans ses schémas exposés (seul
-- "public" l'est, voir Project Settings -> API -> Exposed schemas).
grant usage on schema private to authenticated;

create or replace function private.est_actif_ou_admin(cible_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    exists (
      select 1 from public.abonnes
      where id = cible_id and statut = 'actif'
    )
    or exists (
      select 1 from public.admins
      where id = cible_id
    );
$$;

-- Par défaut, PUBLIC reçoit EXECUTE sur toute nouvelle fonction : on
-- retire ça et on n'autorise explicitement que authenticated, dans le
-- même esprit que tous les GRANT déjà posés ailleurs (le moins de
-- droits nécessaires, jamais plus).
revoke execute on function private.est_actif_ou_admin(uuid) from public;
grant execute on function private.est_actif_ou_admin(uuid) to authenticated;

-- ------------------------------------------------------------
-- 2. Policies marchandises : remplace les exists directs sur
--    abonnes/admins par la fonction
-- ------------------------------------------------------------
drop policy if exists "Marchandises publiees visibles par les membres actifs" on public.marchandises;
create policy "Marchandises publiees visibles par les membres actifs"
  on public.marchandises
  for select
  using (
    statut = 'publiee'
    and private.est_actif_ou_admin(vendeur_id)
    and private.est_actif_ou_admin(auth.uid())
  );

drop policy if exists "Un membre actif peut publier une marchandise" on public.marchandises;
create policy "Un membre actif peut publier une marchandise"
  on public.marchandises
  for insert
  with check (
    auth.uid() = vendeur_id
    and private.est_actif_ou_admin(auth.uid())
  );

-- (Les policies "un vendeur voit/modifie ses propres marchandises" ne
-- font aucune vérification actif/admin : rien à changer là.)

-- ------------------------------------------------------------
-- 3. Policies du bucket Storage marchandises-photos : même correctif
-- ------------------------------------------------------------
drop policy if exists "Upload photo par le vendeur actif" on storage.objects;
create policy "Upload photo par le vendeur actif"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'marchandises-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
    and private.est_actif_ou_admin(auth.uid())
  );

drop policy if exists "Photos visibles proprietaire ou marchandise publiee" on storage.objects;
create policy "Photos visibles proprietaire ou marchandise publiee"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'marchandises-photos'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or exists (
        select 1 from public.marchandises m
        where m.id::text = (storage.foldername(name))[2]
          and m.statut = 'publiee'
          and private.est_actif_ou_admin(m.vendeur_id)
          and private.est_actif_ou_admin(auth.uid())
      )
    )
  );
