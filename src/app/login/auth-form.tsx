"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { AlertCircle, ArrowRight, Check, Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { signInWithPassword, signUp, type LoginState } from "./actions";

const MIN_PASSWORD = 8;

/** Ligne de vérification en direct (inscription) */
function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={`flex items-center gap-2 transition-colors ${ok ? "text-gain" : "text-faint"}`}>
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
          ok ? "border-gain bg-gain text-black" : "border-edge-strong"
        }`}
        aria-hidden
      >
        {ok && <Check size={10} strokeWidth={3.2} />}
      </span>
      {children}
    </li>
  );
}

/**
 * Formulaire de connexion ou d'inscription. Champs contrôlés : après une
 * erreur, l'email reste saisi (une action de formulaire vide sinon les champs).
 */
export function AuthForm({ mode, notice }: { mode: "login" | "signup"; notice?: string | null }) {
  const signup = mode === "signup";
  const [state, action, pending] = useActionState<LoginState, FormData>(signup ? signUp : signInWithPassword, null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);

  const longEnough = password.length >= MIN_PASSWORD;
  const matches = confirm.length > 0 && confirm === password;
  const message = state && !state.ok ? state.message : notice;

  const tab = (active: boolean) =>
    `flex-1 rounded-lg py-2 text-center text-sm font-medium transition ${
      active ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
    }`;

  return (
    <div className="rise-in">
      <h1 className="display text-3xl font-bold tracking-tight">{signup ? "Crée ta collection" : "Content de te revoir"}</h1>
      <p className="mt-2 text-sm text-muted">
        {signup ? "Gratuit et sans pub. Ton compte est actif tout de suite." : "Connecte-toi pour retrouver tes cartes et tes scellés."}
      </p>

      {/* Connexion ↔ inscription */}
      <nav className="mt-7 flex gap-1 rounded-xl border border-edge bg-raised p-1" aria-label="Connexion ou inscription">
        <Link href="/login" replace aria-current={signup ? undefined : "page"} className={tab(!signup)}>
          Connexion
        </Link>
        <Link href="/inscription" replace aria-current={signup ? "page" : undefined} className={tab(signup)}>
          Inscription
        </Link>
      </nav>

      <form action={action} className="mt-6 flex flex-col gap-4">
        <div>
          <label htmlFor="email" className="label-xs mb-1.5 block">
            Adresse email
          </label>
          <div className="relative">
            <Mail size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="ton@email.fr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field !py-3 !pl-10"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="label-xs mb-1.5 block">
            Mot de passe
          </label>
          <div className="relative">
            <Lock size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
            <input
              id="password"
              name="password"
              type={show ? "text" : "password"}
              required
              minLength={signup ? MIN_PASSWORD : undefined}
              autoComplete={signup ? "new-password" : "current-password"}
              placeholder={signup ? `${MIN_PASSWORD} caractères minimum` : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field !py-3 !pl-10 !pr-11"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              aria-pressed={show}
              className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-faint transition hover:text-foreground"
            >
              {show ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
            </button>
          </div>
        </div>

        {signup && (
          <div>
            <label htmlFor="confirm" className="label-xs mb-1.5 block">
              Confirme le mot de passe
            </label>
            <div className="relative">
              <Lock size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
              <input
                id="confirm"
                name="confirm"
                type={show ? "text" : "password"}
                required
                minLength={MIN_PASSWORD}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="field !py-3 !pl-10"
              />
            </div>
            <ul className="mt-2.5 flex flex-col gap-1.5 text-xs">
              <Rule ok={longEnough}>{MIN_PASSWORD} caractères minimum</Rule>
              <Rule ok={matches}>Les deux mots de passe correspondent</Rule>
            </ul>
          </div>
        )}

        {message && (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-loss/30 bg-loss/10 px-3.5 py-2.5 text-sm text-loss">
            <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
            {message}
          </p>
        )}

        <button type="submit" disabled={pending} className="btn btn-primary mt-1 w-full !py-3.5 text-base">
          {pending ? (
            <>
              <Loader2 size={17} className="animate-spin" aria-hidden />
              {signup ? "Création du compte…" : "Connexion…"}
            </>
          ) : (
            <>
              {signup ? "Créer ma collection" : "Se connecter"}
              <ArrowRight size={17} aria-hidden />
            </>
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        {signup ? "Déjà un compte ?" : "Pas encore de compte ?"}{" "}
        <Link href={signup ? "/login" : "/inscription"} replace className="font-semibold text-accent-strong underline-offset-4 hover:underline">
          {signup ? "Se connecter" : "Créer ma collection"}
        </Link>
      </p>
    </div>
  );
}
