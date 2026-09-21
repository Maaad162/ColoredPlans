import { registrarErro, traduzirErro } from "./erros.ts";

export interface MetadadosSync { fromCache: boolean; hasPendingWrites: boolean }
export type EstadoSync = "sincronizado" | "salvando" | "offline" | "erro";
export interface FalhaSync { chave: string; mensagem: string; tentar: () => void }
export interface ResumoSync { estado: EstadoSync; falhas: FalhaSync[]; pendentes: number; aviso: FalhaSync | null }

export function calcularEstadoSync(online: boolean, fontes: MetadadosSync[], pendentes: number, falhas: number): EstadoSync {
  if (falhas) return "erro";
  if (!online || fontes.some((fonte) => fonte.fromCache)) return "offline";
  if (!fontes.length || pendentes || fontes.some((fonte) => fonte.hasPendingWrites)) return "salvando";
  return "sincronizado";
}

// Um controlador por sessão; fontes e operações identificam seu contexto. Promises continuam acompanhadas mesmo quando
// um modal fecha; snapshots nunca apagam falhas de gravação.
export class Sincronizacao {
  private fontes = new Map<string, MetadadosSync>();
  private falhas = new Map<string, FalhaSync>();
  private sequencia = 0;
  private versoesFalhas = new Map<string, number>();
  private ouvintes = new Set<() => void>();
  private pendentes = 0;
  private online = true;
  private aviso: FalhaSync | null = null;
  private resumo: ResumoSync = { estado: "salvando", falhas: [], pendentes: 0, aviso: null };
  subscribe = (ouvinte: () => void) => { this.ouvintes.add(ouvinte); return () => { this.ouvintes.delete(ouvinte); }; };
  getSnapshot = () => this.resumo;
  private publicar() {
    if (this.aviso && this.falhas.get(this.aviso.chave) !== this.aviso) this.aviso = null;
    this.resumo = { estado: calcularEstadoSync(this.online, [...this.fontes.values()], this.pendentes, this.falhas.size),
      falhas: [...this.falhas.values()], pendentes: this.pendentes, aviso: this.aviso };
    this.ouvintes.forEach((ouvinte) => ouvinte());
  }
  conectar(online: boolean) { this.online = online; this.publicar(); }
  fecharAviso() { this.aviso = null; this.publicar(); }
  reabrirAviso() {
    const recentes = [...this.falhas.values()].reverse();
    this.aviso = recentes.find(falha => !falha.chave.startsWith("leitura:")) ?? recentes[0] ?? null;
    this.publicar();
  }
  private registrarFalha(falha: FalhaSync) {
    this.falhas.delete(falha.chave);
    this.falhas.set(falha.chave, falha);
    this.aviso = falha;
  }
  observar(chave: string, metadata: MetadadosSync) { this.fontes.set(chave, metadata); this.falhas.delete(`leitura:${chave}`); this.publicar(); }
  remover(chave: string) { this.fontes.delete(chave); this.falhas.delete(`leitura:${chave}`); this.publicar(); }
  falharLeitura(chave: string, erro: unknown, tentar: () => void) {
    registrarErro(`leitura ${chave}`, erro);
    this.registrarFalha({ chave: `leitura:${chave}`, mensagem: traduzirErro(erro).mensagem, tentar }); this.publicar();
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
        this.registrarFalha({ chave, mensagem: `${rotulo}: ${traduzirErro(erro).mensagem}`, tentar: () => this.enfileirar(chave, operacao, rotulo) });
      }
      throw erro;
    } finally { this.pendentes--; this.publicar(); }
  }
  enfileirar(chave: string, operacao: () => Promise<unknown>, rotulo = "Alteração") {
    // O chamador sem formulário usa o erro persistente e a recuperação global.
    void this.executar(chave, operacao, rotulo).catch(() => undefined);
  }
}
