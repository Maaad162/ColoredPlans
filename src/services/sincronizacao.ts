import { registrarErro, traduzirErro } from "./erros.ts";

export interface MetadadosSync { fromCache: boolean; hasPendingWrites: boolean }
export type EstadoSync = "sincronizado" | "salvando" | "offline" | "erro";
export interface FalhaSync { chave: string; mensagem: string; tentar: () => void }
export interface ResumoSync { estado: EstadoSync; falhas: FalhaSync[]; pendentes: number }

export function calcularEstadoSync(online: boolean, fontes: MetadadosSync[], pendentes: number, falhas: number): EstadoSync {
  if (falhas) return "erro";
  if (!online || fontes.some((fonte) => fonte.fromCache)) return "offline";
  if (!fontes.length || pendentes || fontes.some((fonte) => fonte.hasPendingWrites)) return "salvando";
  return "sincronizado";
}

// Um controlador por sessão/obra. Promises continuam acompanhadas mesmo quando
// um modal fecha; snapshots nunca apagam falhas de gravação.
export class Sincronizacao {
  private fontes = new Map<string, MetadadosSync>();
  private falhas = new Map<string, FalhaSync>();
  private sequencia = 0;
  private versoesFalhas = new Map<string, number>();
  private ouvintes = new Set<() => void>();
  private pendentes = 0;
  private online = true;
  private resumo: ResumoSync = { estado: "salvando", falhas: [], pendentes: 0 };
  subscribe = (ouvinte: () => void) => { this.ouvintes.add(ouvinte); return () => { this.ouvintes.delete(ouvinte); }; };
  getSnapshot = () => this.resumo;
  private publicar() {
    this.resumo = { estado: calcularEstadoSync(this.online, [...this.fontes.values()], this.pendentes, this.falhas.size),
      falhas: [...this.falhas.values()], pendentes: this.pendentes };
    this.ouvintes.forEach((ouvinte) => ouvinte());
  }
  conectar(online: boolean) { this.online = online; this.publicar(); }
  observar(chave: string, metadata: MetadadosSync) { this.fontes.set(chave, metadata); this.falhas.delete(`leitura:${chave}`); this.publicar(); }
  remover(chave: string) { this.fontes.delete(chave); this.falhas.delete(`leitura:${chave}`); this.publicar(); }
  falharLeitura(chave: string, erro: unknown, tentar: () => void) {
    registrarErro(`leitura ${chave}`, erro);
    this.falhas.set(`leitura:${chave}`, { chave: `leitura:${chave}`, mensagem: traduzirErro(erro).mensagem, tentar }); this.publicar();
  }
  async executar<T>(chave: string, operacao: () => Promise<T>, rotulo = "Alteração"): Promise<T> {
    const sequencia = ++this.sequencia;
    this.pendentes++; this.publicar();
    try {
      const resultado = await operacao();
      if ((this.versoesFalhas.get(chave) ?? 0) <= sequencia) { this.falhas.delete(chave); this.versoesFalhas.delete(chave); }
      return resultado;
    } catch (erro) {
      registrarErro("gravação", erro);
      if ((this.versoesFalhas.get(chave) ?? 0) <= sequencia) {
        this.versoesFalhas.set(chave, sequencia);
        this.falhas.set(chave, { chave, mensagem: `${rotulo}: ${traduzirErro(erro).mensagem}`, tentar: () => this.enfileirar(chave, operacao, rotulo) });
      }
      throw erro;
    } finally { this.pendentes--; this.publicar(); }
  }
  enfileirar(chave: string, operacao: () => Promise<unknown>, rotulo = "Alteração") {
    // O chamador sem formulário usa o erro persistente e a recuperação global.
    void this.executar(chave, operacao, rotulo).catch(() => undefined);
  }
}
