// Le SEUL élément d'identité jamais montré d'un membre à un autre :
// aucune donnée personnelle, juste ce badge.
export default function BadgeVerifie() {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-brand border border-accent px-2 py-1 text-xs font-medium text-accent">
      ✓ Société vérifiée par SKY VANTAC
    </span>
  );
}
