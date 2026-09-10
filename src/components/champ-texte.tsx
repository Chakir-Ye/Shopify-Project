import type { InputHTMLAttributes } from "react";

type ChampTexteProps = {
  label?: string;
} & InputHTMLAttributes<HTMLInputElement>;

// Champ de formulaire ".inp" du design system SKY VANTAC. Le label est
// optionnel (ex: le champ de saisie d'un message de chat n'en affiche
// pas, mais garde le même style).
export default function ChampTexte({ label, id, ...props }: ChampTexteProps) {
  return (
    <div>
      {label && (
        <label htmlFor={id} className="mb-1 block text-sm font-medium text-muted">
          {label}
        </label>
      )}
      <input
        id={id}
        className="w-full rounded-brand border border-line bg-ink px-4 py-2.5 text-parchment outline-none placeholder:text-dim focus:border-accent"
        {...props}
      />
    </div>
  );
}
