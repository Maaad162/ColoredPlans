import { useState } from "react";
import { traduzirErro } from "../../services/erros";
import type { LegendaUsuario } from "../../types/planta";

interface GerenciarLegendasProps {
  legendas: LegendaUsuario[];
  usoPorLegenda: Record<string, number>;
  onCriar: (nome: string, cor: string) => Promise<void>;
  onEditar: (id: string, nome: string, cor: string) => Promise<void>;
  onExcluir: (id: string) => Promise<void>;
  onMensagem: (mensagem: string) => void;
}

export function GerenciarLegendas({
  legendas,
  usoPorLegenda,
  onCriar,
  onEditar,
  onExcluir,
  onMensagem,
}: GerenciarLegendasProps) {
  const [aberto, setAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState("#8059b6");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function novo() {
    setEditandoId(null);
    setNome("");
    setCor("#8059b6");
    setErro(null);
  }

  function editar(legenda: LegendaUsuario) {
    setEditandoId(legenda.id);
    setNome(legenda.nome);
    setCor(legenda.cor);
    setErro(null);
  }

  async function salvar(event: React.FormEvent) {
    event.preventDefault();
    const nomeNormalizado = nome.trim();
    if (!nomeNormalizado) {
      setErro("Toda cor precisa possuir uma descrição/legenda.");
      return;
    }
    if (
      legendas.some(
        (legenda) =>
          legenda.id !== editandoId &&
          legenda.nome.toLocaleLowerCase() === nomeNormalizado.toLocaleLowerCase(),
      )
    ) {
      setErro("Já existe uma legenda com esse nome.");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      if (editandoId) {
        await onEditar(editandoId, nomeNormalizado, cor);
        onMensagem(`Legenda “${nomeNormalizado}” atualizada.`);
      } else {
        await onCriar(nomeNormalizado, cor);
        onMensagem(`Legenda “${nomeNormalizado}” criada.`);
      }
      novo();
    } catch (erro) {
      setErro(traduzirErro(erro).mensagem);
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(legenda: LegendaUsuario) {
    const usos = usoPorLegenda[legenda.id] ?? 0;
    if (usos > 0) {
      onMensagem(`“${legenda.nome}” está em uso em ${usos} marcação(ões). Limpe essas marcações primeiro.`);
      return;
    }
    if (legendas.length <= 1) {
      onMensagem("A conta precisa manter pelo menos uma legenda.");
      return;
    }
    if (!window.confirm(`Excluir a legenda “${legenda.nome}”?`)) return;
    try {
      await onExcluir(legenda.id);
      if (editandoId === legenda.id) novo();
      onMensagem(`Legenda “${legenda.nome}” excluída.`);
    } catch (erro) {
      onMensagem(traduzirErro(erro).mensagem);
    }
  }

  return (
    <>
      <button className="button button--secondary" type="button" onClick={() => setAberto(true)}>
        <span className="legend-button__swatches" aria-hidden="true"><i /><i /><i /></span>
        Cores e legendas
      </button>
      {aberto && (
        <div className="modal-backdrop" onMouseDown={() => setAberto(false)}>
          <section
            className="modal-card modal-card--wide legend-manager"
            role="dialog"
            aria-modal="true"
            aria-labelledby="legendas-gerenciar-titulo"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="manager-heading">
              <div>
                <p className="eyebrow">Configuração da conta</p>
                <h2 id="legendas-gerenciar-titulo">Cores e legendas</h2>
                <p>Cada cor representa obrigatoriamente uma legenda.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setAberto(false)} aria-label="Fechar">×</button>
            </div>
            <div className="legend-manager__body">
              <div className="legend-manager__list">
                {legendas.map((legenda) => (
                  <div className={`legend-row${editandoId === legenda.id ? " legend-row--active" : ""}`} key={legenda.id}>
                    <button type="button" disabled={salvando} className="legend-row__main" onClick={() => editar(legenda)}>
                      <span style={{ backgroundColor: legenda.cor }} aria-hidden="true" />
                      <span><strong>{legenda.nome}</strong><small>{usoPorLegenda[legenda.id] ?? 0} marcações</small></span>
                    </button>
                    <button type="button" disabled={salvando} className="legend-row__delete" onClick={() => void excluir(legenda)} aria-label={`Excluir ${legenda.nome}`}>×</button>
                  </div>
                ))}
                <button type="button" disabled={salvando} className="button button--ghost button--full" onClick={novo}>+ Nova legenda</button>
              </div>
              <form className="legend-form" onSubmit={salvar}>
                <p className="field-label">{editandoId ? "Editar legenda" : "Nova legenda"}</p>
                <label htmlFor="legenda-nome">Descrição/legenda</label>
                <input id="legenda-nome" maxLength={48} value={nome} onChange={(event) => setNome(event.target.value)} placeholder="Ex.: Aguardando correção" required />
                <label htmlFor="legenda-cor">Cor</label>
                <div className="color-field">
                  <input id="legenda-cor" type="color" value={cor} onChange={(event) => setCor(event.target.value)} />
                  <code>{cor.toUpperCase()}</code>
                </div>
                <div className="legend-preview">
                  <span style={{ backgroundColor: cor }} aria-hidden="true" />
                  <strong>{nome.trim() || "Sua legenda"}</strong>
                </div>
                {erro && <p className="form-error" role="alert">{erro}</p>}
                <div className="modal-card__acoes">
                  {editandoId && <button className="button button--ghost" type="button" onClick={novo}>Cancelar edição</button>}
                  <button className="button button--primary" type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Salvar legenda"}</button>
                </div>
              </form>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
