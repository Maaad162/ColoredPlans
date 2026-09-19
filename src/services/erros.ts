export type CodigoErro = "conexao" | "permissao" | "autenticacao" | "validacao" | "ausente" | "conflito" | "firestore" | "desconhecido";

export class ErroOperacional extends Error {
  readonly codigo: CodigoErro;
  constructor(codigo: CodigoErro, mensagem: string) { super(mensagem); this.codigo = codigo; }
}

const mensagens: Record<CodigoErro, string> = {
  conexao: "Não foi possível sincronizar agora. Verifique sua conexão e tente novamente.",
  permissao: "A alteração não foi salva. Verifique sua permissão ou se os dados mudaram em outra sessão antes de tentar novamente.",
  autenticacao: "Sua sessão não permite continuar. Entre novamente.",
  validacao: "Os dados informados são inválidos. Confira os campos antes de salvar.",
  ausente: "Este recurso não existe mais. Confira os dados atualizados.",
  conflito: "Os dados mudaram em outra sessão. Confira o estado atual antes de tentar novamente.",
  firestore: "Não foi possível concluir a operação no banco de dados. Tente novamente.",
  desconhecido: "Não foi possível concluir a operação. Tente novamente; se persistir, contate o responsável.",
};

export function traduzirErro(erro: unknown): { codigo: CodigoErro; mensagem: string } {
  if (erro instanceof ErroOperacional) return { codigo: erro.codigo, mensagem: erro.message };
  const code = typeof erro === "object" && erro !== null && "code" in erro && typeof erro.code === "string" ? erro.code : "";
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-email"].includes(code)) {
    return { codigo: "autenticacao", mensagem: "E-mail ou senha incorretos. Confira seus dados." };
  }
  if (code === "auth/too-many-requests") return { codigo: "autenticacao", mensagem: "Muitas tentativas. Aguarde alguns minutos antes de entrar novamente." };
  const simples = code.replace(/^firestore\//, "");
  const codigo: CodigoErro = ["unavailable", "deadline-exceeded", "auth/network-request-failed"].includes(simples) ? "conexao"
    : simples === "permission-denied" ? "permissao"
    : simples === "unauthenticated" || code.startsWith("auth/") ? "autenticacao"
    : simples === "not-found" ? "ausente"
    : ["aborted", "already-exists", "failed-precondition"].includes(simples) ? "conflito"
    : simples === "invalid-argument" || erro instanceof SyntaxError ? "validacao"
    : ["internal", "resource-exhausted", "data-loss", "cancelled"].includes(simples) ? "firestore" : "desconhecido";
  return { codigo, mensagem: mensagens[codigo] };
}

export function registrarErro(contexto: string, erro: unknown) {
  // Nunca registra payload, credenciais, e-mail ou mensagem bruta do SDK.
  console.error(`[ColoredPlans] ${contexto}: ${traduzirErro(erro).codigo}`);
}
