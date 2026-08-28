import { useState } from "react";
import type { TipoConta } from "../../types/planta";

interface ConfigurarContaProps {
  email: string;
  erro: string | null;
  onConfigurar: (tipo: TipoConta) => Promise<void>;
  onSair: () => Promise<void>;
}

export function ConfigurarConta({
  email,
  erro,
  onConfigurar,
  onSair,
}: ConfigurarContaProps) {
  const [selecionado, setSelecionado] = useState<TipoConta | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function confirmar() {
    if (!selecionado) return;
    setSalvando(true);
    try {
      await onConfigurar(selecionado);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <main className="account-setup">
      <section className="account-setup__card" aria-labelledby="tipo-conta-titulo">
        <div className="brand account-setup__brand">
          <span className="brand__mark" aria-hidden="true"><span /><span /><span /></span>
          <div>
            <p className="brand__overline">Primeiro acesso</p>
            <h1>Configurar conta</h1>
          </div>
        </div>
        <div className="account-setup__intro">
          <p className="eyebrow">Perfil de trabalho</p>
          <h2 id="tipo-conta-titulo">Como esta conta será utilizada?</h2>
          <p>Escolha com atenção. O tipo fica protegido e não poderá ser alterado pela própria conta.</p>
        </div>
        <div className="account-types" role="radiogroup" aria-label="Tipo de conta">
          <button
            type="button"
            role="radio"
            aria-checked={selecionado === "apontamento"}
            className={`account-type${selecionado === "apontamento" ? " account-type--selected" : ""}`}
            onClick={() => setSelecionado("apontamento")}
          >
            <span className="account-type__icon" aria-hidden="true">✓</span>
            <span><strong>Apontamento</strong><small>Qualidade, edificação, mapas e medições.</small></span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={selecionado === "estoque"}
            className={`account-type${selecionado === "estoque" ? " account-type--selected" : ""}`}
            onClick={() => setSelecionado("estoque")}
          >
            <span className="account-type__icon" aria-hidden="true">▦</span>
            <span><strong>Estoque</strong><small>Mapas, almoxarifado, kits e consumo.</small></span>
          </button>
        </div>
        {erro && <p className="auth-error" role="alert">{erro}</p>}
        <button
          className="button button--primary account-setup__confirm"
          type="button"
          disabled={!selecionado || salvando}
          onClick={() => void confirmar()}
        >
          {salvando ? "Configurando…" : "Confirmar tipo de conta"}
        </button>
        <div className="account-setup__footer">
          <span>{email}</span>
          <button type="button" className="link-button" onClick={() => void onSair()}>Sair</button>
        </div>
      </section>
    </main>
  );
}
