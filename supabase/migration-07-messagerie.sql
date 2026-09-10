-- ============================================================
-- SKY VANTAC — Brique 5 : messagerie (conversations + messages)
-- À copier-coller dans Supabase -> SQL Editor -> "New query" -> Run
-- (à exécuter APRÈS toutes les migrations précédentes, notamment
--  migration-06-admins.sql)
-- ============================================================

-- Note sur l'identité affichée (décision produit) : aucune donnée
-- personnelle n'est stockée ni révélée nulle part dans ce schéma. Le
-- badge "Société vérifiée par SKY VANTAC" montré côté app se déduit
-- simplement de abonnes.statut = 'actif' (ou de la présence dans
-- admins) — rien à ajouter en base pour ça.

-- ------------------------------------------------------------
-- 1. Table conversations
-- ------------------------------------------------------------
-- Toujours rattachée à une marchandise précise. vendeur_id est
-- dénormalisé depuis marchandises.vendeur_id pour simplifier les
-- policies (évite une jointure supplémentaire partout).
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  marchandise_id uuid not null references public.marchandises (id) on delete cascade,
  acheteur_id uuid not null references public.abonnes (id) on delete cascade,
  vendeur_id uuid not null references public.abonnes (id) on delete cascade,
  dernier_message_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint conversations_acheteur_vendeur_distincts check (acheteur_id <> vendeur_id),
  -- Recliquer "Contacter le vendeur" sur la même annonce retrouve la
  -- conversation existante au lieu d'en créer une nouvelle.
  constraint conversations_marchandise_acheteur_unique unique (marchandise_id, acheteur_id)
);

create index if not exists conversations_acheteur_id_idx on public.conversations (acheteur_id);
create index if not exists conversations_vendeur_id_idx on public.conversations (vendeur_id);
create index if not exists conversations_marchandise_id_idx on public.conversations (marchandise_id);

alter table public.conversations enable row level security;

grant select, insert, update, delete on public.conversations to service_role;
-- Pas de update/delete pour authenticated : seul le trigger (plus bas,
-- en security definer) met à jour dernier_message_le/updated_at.
grant select, insert on public.conversations to authenticated;

drop policy if exists "Participants ou admin voient la conversation" on public.conversations;
create policy "Participants ou admin voient la conversation"
  on public.conversations
  for select
  using (
    auth.uid() = acheteur_id
    or auth.uid() = vendeur_id
    or exists (select 1 from public.admins where admins.id = auth.uid())
  );

drop policy if exists "Un acheteur actif demarre une conversation" on public.conversations;
create policy "Un acheteur actif demarre une conversation"
  on public.conversations
  for insert
  with check (
    auth.uid() = acheteur_id
    and (
      exists (
        select 1 from public.abonnes
        where abonnes.id = auth.uid() and abonnes.statut = 'actif'
      )
      or exists (select 1 from public.admins where admins.id = auth.uid())
    )
    -- La marchandise visée doit être réellement publiée, par le même
    -- vendeur que celui déclaré, avec un vendeur actif-ou-admin — on
    -- ne peut pas démarrer une conversation sur une annonce qu'on ne
    -- devrait même pas pouvoir voir.
    and exists (
      select 1 from public.marchandises m
      where m.id = marchandise_id
        and m.vendeur_id = conversations.vendeur_id
        and m.statut = 'publiee'
        and (
          exists (
            select 1 from public.abonnes v
            where v.id = m.vendeur_id and v.statut = 'actif'
          )
          or exists (select 1 from public.admins where admins.id = m.vendeur_id)
        )
    )
  );

-- ------------------------------------------------------------
-- 2. Table messages
-- ------------------------------------------------------------
-- Immuables : aucune policy update/delete, jamais modifiés ni
-- supprimés une fois envoyés.
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  expediteur_id uuid not null references public.abonnes (id) on delete cascade,
  contenu text not null check (char_length(trim(contenu)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_id_idx on public.messages (conversation_id, created_at);

alter table public.messages enable row level security;

grant select, insert, update, delete on public.messages to service_role;
grant select, insert on public.messages to authenticated;

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
    or exists (select 1 from public.admins where admins.id = auth.uid())
  );

drop policy if exists "Un participant actif envoie un message" on public.messages;
create policy "Un participant actif envoie un message"
  on public.messages
  for insert
  with check (
    auth.uid() = expediteur_id
    and (
      exists (
        select 1 from public.abonnes
        where abonnes.id = auth.uid() and abonnes.statut = 'actif'
      )
      or exists (select 1 from public.admins where admins.id = auth.uid())
    )
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.acheteur_id = auth.uid() or c.vendeur_id = auth.uid())
    )
  );

-- ------------------------------------------------------------
-- 3. Trigger : tient dernier_message_le/updated_at à jour
-- ------------------------------------------------------------
-- security definer : s'exécute avec les droits du propriétaire de la
-- fonction, pas ceux de l'utilisateur connecté — c'est ce qui permet
-- de mettre à jour "conversations" sans avoir à accorder un droit
-- update général aux participants.
create or replace function public.gerer_nouveau_message()
returns trigger
security definer set search_path = public
language plpgsql
as $$
begin
  update public.conversations
  set dernier_message_le = new.created_at,
      updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists on_message_insere on public.messages;
create trigger on_message_insere
  after insert on public.messages
  for each row execute procedure public.gerer_nouveau_message();
