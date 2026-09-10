import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  recupererMarchandiseParId,
  genererUrlSigneePhoto,
} from "@/lib/marchandises-serveur";
import {
  libelleCategorie,
  libelleUnite,
  libelleEtat,
  formaterPrix,
} from "@/lib/marchandises";
import BoutonContacterVendeur from "@/components/bouton-contacter-vendeur";

function Detail({ titre, valeur }: { titre: string; valeur: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[.1em] text-muted">{titre}</p>
      <p className="mt-1 text-sm text-parchment">{valeur}</p>
    </div>
  );
}

export default async function MarchandiseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const marchandise = await recupererMarchandiseParId(id);

  if (!marchandise) {
    notFound();
  }

  const estLeVendeur = marchandise.vendeur_id === user?.id;

  const urlsPhotos = (
    await Promise.all(
      marchandise.photos.map((chemin) => genererUrlSigneePhoto(chemin))
    )
  ).filter((url): url is string => Boolean(url));

  return (
    <main className="flex-1 bg-ink px-6 py-10 text-parchment">
      <div className="mx-auto w-full max-w-3xl">
        <p className="text-xs uppercase tracking-[.14em] text-muted">
          {libelleCategorie(marchandise.categorie)}
        </p>
        <h1 className="font-playfair mt-2 text-3xl font-semibold tracking-[.07em]">
          {marchandise.titre}
        </h1>

        {urlsPhotos.length > 0 ? (
          <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {urlsPhotos.map((url, index) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={url}
                alt={`${marchandise.titre} — photo ${index + 1}`}
                className="aspect-square w-full rounded-card border border-line object-cover"
              />
            ))}
          </div>
        ) : (
          <div className="mt-6 flex aspect-video w-full items-center justify-center rounded-card border border-line bg-ink-2 text-sm text-dim">
            Aucune photo
          </div>
        )}

        <div className="mt-8 rounded-card border border-line bg-ink-2 p-6">
          <p className="whitespace-pre-wrap text-sm text-parchment">
            {marchandise.description}
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Detail
            titre="Quantité"
            valeur={`${marchandise.quantite} ${libelleUnite(marchandise.unite)}`}
          />
          {marchandise.etat_marchandise && (
            <Detail
              titre="État"
              valeur={libelleEtat(marchandise.etat_marchandise)}
            />
          )}
          <Detail
            titre="Localisation"
            valeur={
              marchandise.ville
                ? `${marchandise.ville}, ${marchandise.pays}`
                : marchandise.pays
            }
          />
          <Detail
            titre="Prix"
            valeur={formaterPrix(marchandise.prix, marchandise.devise)}
          />
        </div>

        <div className="mt-8 rounded-card border border-line bg-ink-2 p-6">
          <p className="text-sm font-medium text-parchment">
            Membre vérifié du cercle SKY VANTAC
          </p>
          <p className="mt-1 text-sm text-dim">
            L&apos;identité du vendeur ne se révèle que dans le cadre d&apos;un
            échange initié via la messagerie.
          </p>
          {!estLeVendeur && marchandise.statut === "publiee" && (
            <div className="mt-4">
              <BoutonContacterVendeur marchandiseId={marchandise.id} />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
