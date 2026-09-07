# SKY VANTAC — inscription + paiement + validation admin + coquille applicative

Le parcours complet aujourd'hui :

1. Un visiteur crée un compte (e-mail + mot de passe).
2. Il est redirigé vers Stripe Checkout pour payer l'abonnement (1000&nbsp;€/an).
3. Une fois que **Stripe confirme le paiement** (via un webhook), sa
   candidature passe en revue (`en_revue`) — l'accès n'est **pas** encore
   ouvert.
4. Toi (l'admin) tu vas sur `/admin`, tu vois la liste des candidatures en
   attente, et tu cliques **Valider** ou **Refuser**.
5. Si validé → l'accès à `/accueil` s'ouvre. Si refusé → tu rembourses
   toi-même le paiement depuis le Dashboard Stripe.
6. Tant que rien n'a été validé, l'accès reste fermé — même si la personne
   revient sur le site cent fois.

## Comment ça marche (en simple)

- **Supabase** garde les comptes (e-mail / mot de passe) et une table
  `abonnes` avec un statut par personne :
  - `en_attente` — compte créé, pas encore payé
  - `en_revue` — a payé, en attente de ta validation
  - `actif` — validé, accès ouvert
  - `refuse` — candidature refusée (à toi de rembourser dans Stripe)
  - `annule` — abonnement résilié après avoir été actif
- **Stripe** gère le paiement. Après paiement, Stripe appelle notre site
  en coulisses (un "webhook") pour dire "cette personne a payé" — le
  statut passe alors à `en_revue`, jamais directement à `actif`.
- **`/admin`** est une page protégée (réservée aux e-mails listés dans
  `ADMIN_EMAILS`) où tu valides ou refuses chaque candidature à la main.
- Personne — ni l'utilisateur, ni même une erreur de code côté site — ne
  peut mettre son propre statut à `actif`. Seuls le webhook Stripe (pour
  passer en `en_revue`) et toi depuis `/admin` (pour passer en `actif`)
  peuvent le faire, via la clé secrète Supabase.

## Ce qu'il te reste à faire (5 étapes)

### 1. Récupérer l'URL de ton projet Supabase
Supabase → ton projet → **Settings → API → Project URL**.
Colle-la dans le fichier `.env.local` à la ligne `NEXT_PUBLIC_SUPABASE_URL`.

### 2. Désactiver la confirmation par e-mail (pour l'instant)
Supabase → **Authentication → Sign In / Providers → Email** → décoche
"Confirm email". (On pourra la réactiver plus tard, dans une prochaine
brique — pour l'instant ça simplifie le parcours inscription → paiement.)

### 3. Créer la table dans Supabase
Supabase → **SQL Editor → New query** → colle tout le contenu du fichier
`supabase/schema.sql` de ce projet → clique **Run**.
Ça crée la table `abonnes` qui garde en mémoire qui a payé.

Ensuite, fais la même chose avec `supabase/migration-02-admission.sql`
(nouvelle requête, coller, Run) — ça ajoute les statuts `en_revue` /
`refuse` nécessaires à la validation manuelle des candidatures.

### 3bis. Définir qui a accès à /admin
Dans `.env.local`, remplis `ADMIN_EMAILS` avec l'e-mail (ou les e-mails,
séparés par des virgules) avec le(s)quel(s) tu te connectes en tant
qu'admin. Doit correspondre exactement à l'e-mail d'un compte déjà créé
sur le site.

### 4. Configurer le webhook Stripe
C'est l'étape la plus importante : c'est elle qui permet à Stripe de dire
à ton site "ce client a payé".

**Pour tester en local (sur ton ordinateur) :**
1. Installe l'outil Stripe CLI : https://docs.stripe.com/stripe-cli
2. Connecte-le à ton compte : `stripe login`
3. Lance : `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
4. La commande affiche une clé qui commence par `whsec_...` → colle-la
   dans `.env.local` à la ligne `STRIPE_WEBHOOK_SECRET`.
5. Laisse cette commande tourner dans un terminal pendant que tu testes.

**Pour la mise en ligne (plus tard, quand le site sera hébergé) :**
Stripe → **Développeurs → Webhooks → Ajouter un endpoint** → mets l'adresse
`https://TON-DOMAINE/api/webhooks/stripe` → sélectionne l'événement
`checkout.session.completed` (et `customer.subscription.deleted`) → Stripe
te donnera un nouveau `whsec_...` à mettre en ligne à ce moment-là.

### 5. Lancer le site
```bash
npm install
npm run dev
```
Ouvre http://localhost:3000 dans ton navigateur.

## Tester le parcours complet

1. Lance `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
   dans un terminal (garde-le ouvert).
2. Lance `npm run dev` dans un autre terminal.
3. Va sur http://localhost:3000/inscription, crée un compte de test.
4. Tu arrives sur Stripe Checkout : utilise une carte de test, par exemple
   `4242 4242 4242 4242`, une date future, n'importe quel CVC.
5. Après le paiement, tu es redirigé vers une page "candidature en cours
   de vérification".
6. Connecte-toi avec ton compte admin (celui listé dans `ADMIN_EMAILS`),
   va sur `/admin`, clique **Valider**. En quelques secondes, la personne
   est automatiquement envoyée vers `/accueil`.

Si ça reste bloqué sur "on confirme ton paiement", vérifie que la commande
`stripe listen` tourne toujours et que `STRIPE_WEBHOOK_SECRET` dans
`.env.local` correspond bien à celle qu'elle a affichée.

## Fichiers importants

- `.env.local` — toutes les clés secrètes (jamais envoyé sur GitHub).
- `supabase/schema.sql` — à coller dans Supabase une seule fois.
- `supabase/migration-02-admission.sql` — à coller ensuite, une seule fois.
- `supabase/migration-03-marchandises.sql` — à coller ensuite, une seule
  fois : table des marchandises (Brique 4).
- `supabase/migration-04-marchandises-photos.sql` — à coller ensuite,
  une seule fois : registre des empreintes de photos, pour empêcher la
  publication de la même image sur deux annonces (Brique 4).
- `supabase/migration-05-grants-marchandises.sql` — à coller ensuite,
  une seule fois : corrige des droits SQL manquants sur `marchandises`
  et `marchandises_photos` qui bloquaient toute publication.
- `supabase/migration-06-admins.sql` — à coller ensuite, une seule
  fois : table `admins` (contrepartie base de `ADMIN_EMAILS`) et
  réécriture des policies concernées pour accepter "actif OU admin" de
  façon unifiée, au lieu de contourner la RLS au cas par cas côté code.
- `supabase/migration-08-visibilite-croisee.sql` — à coller ensuite,
  une seule fois : corrige un bug où chaque membre ne voyait que ses
  propres marchandises sur `/marchandises` au lieu de voir toutes
  celles du cercle. Cause : les policies RLS vérifiaient "vendeur actif
  ou admin" via une sous-requête sur `abonnes`/`admins`, mais ces deux
  tables sont elles-mêmes protégées par RLS — une sous-requête reste
  soumise à la RLS de la table qu'elle interroge, donc elle ne
  trouvait jamais la ligne d'un AUTRE membre. Corrigé avec une fonction
  `private.est_actif_ou_admin(id)` en `security definer` (contourne la
  RLS pour cette seule vérification, sans exposer `abonnes`/`admins`
  nulle part : le schéma `private` n'est pas exposé par l'API
  Supabase).
- `src/app/inscription` — page de création de compte.
- `src/app/connexion` — page de connexion.
- `src/app/api/checkout` — crée la session de paiement Stripe.
- `src/app/api/webhooks/stripe` — reçoit la confirmation de paiement de
  Stripe (fait passer le statut à `en_revue`, jamais directement `actif`).
- `src/app/(app)` — les pages connectées avec header commun (Brique 3) :
  `/accueil` (dashboard), `/marchandises` (liste des annonces
  publiées), `/marchandises/nouvelle` (formulaire de publication),
  `/marchandises/[id]` (fiche détail — vendeur anonyme, "Membre
  vérifié"), `/recherches`, `/messages`, `/mon-espace` (dont "Mes
  marchandises", tous statuts confondus), `/admin`. `/membre` redirige
  désormais vers `/accueil`.
- `src/lib/marchandises-serveur.ts` — récupération des marchandises
  (visibles ou propres à l'utilisateur) et génération d'URLs signées
  pour les photos du bucket privé. Gère la même double logique
  actif/admin que la publication : un admin contourne la RLS via le
  client de service, donc la règle de visibilité est reproduite
  manuellement en code pour lui.
- `src/app/(app)/marchandises/nouvelle/actions.ts` — Server Action qui
  crée une marchandise : calcule le hash SHA-256 de chaque photo et
  bloque la publication si l'image existe déjà (voir
  `marchandises_photos`), avant toute création ou upload.
- `src/components/header.tsx` — barre de navigation commune à toutes les
  pages connectées (logo, menu, recherche, notifications, profil, admin).
- `src/proxy.ts` — vérifie à chaque visite que la personne est bien connectée
  (et abonnée active pour les pages de `(app)`, admin pour `/admin`) avant
  de la laisser entrer.

## Confidentialité (règle structurante depuis la Brique 3)

Il n'existe **aucun annuaire de membres** dans l'application, et il n'y en
aura jamais : impossible de lister, chercher ou parcourir les autres
membres. L'identité d'un membre ne se révèle que dans le cadre d'un
échange commercial initié via une marchandise. Il n'y a pas non plus
d'indicateur de présence, et les admins sont invisibles pour tout le
monde (y compris entre eux). Toute nouvelle fonctionnalité doit respecter
cette règle.
