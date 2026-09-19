import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { OBRA_PADRAO } from "./config/dados";
import "./styles/index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error('Elemento raiz "root" não encontrado.');
}

const root = createRoot(rootElement);

async function iniciarAplicacao() {
  try {
    const { default: App } = await import("./App");

    root.render(
      <StrictMode>
        <App obra={OBRA_PADRAO} />
      </StrictMode>,
    );
  } catch (erro) {
    const detalhe =
      erro instanceof Error ? erro.message : "Erro desconhecido ao iniciar a aplicação.";

    root.render(
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "#f5f5f3",
          color: "#202522",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <section
          style={{
            width: "min(560px, 100%)",
            padding: "32px",
            border: "1px solid #ddd",
            borderRadius: "16px",
            background: "#fff",
            boxShadow: "0 12px 32px rgba(0, 0, 0, 0.08)",
          }}
        >
          <h1 style={{ marginTop: 0 }}>Não foi possível iniciar a aplicação</h1>
          <p>{detalhe}</p>
          <p>
            Copie <code>.env.example</code> para <code>.env.local</code>, preencha as
            credenciais do Firebase e reinicie o servidor de desenvolvimento.
          </p>
        </section>
      </main>,
    );
  }
}

void iniciarAplicacao();
