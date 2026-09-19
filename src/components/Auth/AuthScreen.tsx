import { FirebaseError } from "firebase/app";
import { useState } from "react";

interface AuthScreenProps {
  onEntrar: (email: string, senha: string) => Promise<void>;
}

const mensagensErro: Record<string, string> = {
  "auth/invalid-credential": "E-mail ou senha incorretos.",
  "auth/invalid-email": "Digite um endereço de e-mail válido.",
  "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  "auth/network-request-failed": "Não foi possível conectar ao Firebase. Verifique a internet.",
  "auth/operation-not-allowed":
    "O login por e-mail e senha ainda não foi habilitado no Firebase.",
};

export function AuthScreen({ onEntrar }: AuthScreenProps) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await onEntrar(email, senha);
    } catch (falha) {
      const mensagem =
        falha instanceof FirebaseError
          ? mensagensErro[falha.code] ?? "Não foi possível entrar. Verifique seus dados."
          : "Não foi possível entrar. Tente novamente.";
      setErro(mensagem);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-titulo">
        <div className="brand auth-card__brand">
          <span className="brand__mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <div>
            <p className="brand__overline">Acompanhamento da obra</p>
            <h1>Mapa de unidades</h1>
          </div>
        </div>

        <div className="auth-card__intro">
          <p className="eyebrow">Acesso seguro</p>
          <h2 id="login-titulo">Entre na sua conta</h2>
          <p>Entre com a conta fornecida pelo responsável pela obra.</p>
        </div>

        <form onSubmit={handleSubmit}>
          <label htmlFor="login-email">E-mail</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="seu@email.com"
            required
          />

          <label htmlFor="login-senha">Senha</label>
          <input
            id="login-senha"
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={(event) => setSenha(event.target.value)}
            placeholder="Sua senha"
            minLength={6}
            required
          />

          {erro && <p className="auth-error" role="alert">{erro}</p>}

          <button className="button button--primary auth-submit" type="submit" disabled={enviando}>
            {enviando ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </section>
      <p className="auth-page__footer">Dados sincronizados com Firebase Firestore</p>
    </main>
  );
}

export function AuthLoading() {
  return (
    <main className="auth-page" aria-label="Carregando aplicação">
      <div className="auth-loading">
        <span aria-hidden="true" />
        <p>Conectando ao Firebase…</p>
      </div>
    </main>
  );
}
