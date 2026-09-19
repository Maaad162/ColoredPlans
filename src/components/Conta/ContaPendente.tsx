interface ContaPendenteProps {
  email: string;
  erro: string | null;
  onSair: () => Promise<void>;
}

export function ContaPendente({ email, erro, onSair }: ContaPendenteProps) {
  return (
    <main className="account-setup">
      <section className="account-setup__card" aria-labelledby="conta-pendente-titulo">
        <div className="account-setup__intro">
          <h1 id="conta-pendente-titulo">Conta aguardando liberação</h1>
          <p>Solicite ao responsável a configuração do setor da sua conta.</p>
        </div>
        {erro && <p className="auth-error" role="alert">{erro}</p>}
        <div className="account-setup__footer">
          <span>{email}</span>
          <button type="button" className="link-button" onClick={() => void onSair()}>Sair</button>
        </div>
      </section>
    </main>
  );
}
