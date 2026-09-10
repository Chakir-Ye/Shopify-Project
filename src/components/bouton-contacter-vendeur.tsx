"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import BoutonPrimaire from "@/components/bouton-primaire";
import { contacterVendeur } from "@/app/(app)/messages/actions";

type BoutonContacterVendeurProps = {
  marchandiseId: string;
};

export default function BoutonContacterVendeur({
  marchandiseId,
}: BoutonContacterVendeurProps) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function gererClic() {
    setEnCours(true);
    setErreur(null);

    const resultat = await contacterVendeur(marchandiseId);

    if (!resultat.succes) {
      setErreur(resultat.erreur);
      setEnCours(false);
      return;
    }

    router.push(`/messages/${resultat.conversationId}`);
  }

  return (
    <div>
      <BoutonPrimaire onClick={gererClic} disabled={enCours}>
        {enCours ? "Un instant..." : "Contacter le vendeur"}
      </BoutonPrimaire>
      {erreur && <p className="mt-2 text-sm text-red-400">{erreur}</p>}
    </div>
  );
}
