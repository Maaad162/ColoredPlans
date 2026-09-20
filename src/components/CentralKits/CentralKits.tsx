import { useEffect, useMemo, useState } from "react";
import { BLOCOS, UNIDADES, UNIDADE_BY_ID } from "../../data/planta";
import type { useKits } from "../../hooks/useKits";
import { traduzirErro } from "../../services/erros";
import { type DadosKit } from "../../services/kits";
import type { Kit, MaterialKit } from "../../types/planta";

interface CentralKitsProps {
  kitsState: ReturnType<typeof useKits>;
  onMensagem: (mensagem: string) => void;
  onAbrirMapa: (mapaId: string) => void;
}

function gerarId(prefixo: string) {
  return `${prefixo}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function materialVazio(): MaterialKit {
  return {
    id: gerarId("material"),
    codigoSienge: "",
    descricao: "",
    detalhe: "",
    quantidadePorKit: 1,
    unidadeMedida: "un",
    disponibilidadeManual: null,
  };
}

function formatarQuantidade(valor: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(valor);
}

export function CentralKits({ kitsState, onMensagem, onAbrirMapa }: CentralKitsProps) {
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Kit | "novo" | null>(null);
  const [vinculando, setVinculando] = useState<Kit | null>(null);

  useEffect(() => {
    if (kitsState.kits.length === 0) {
      setSelecionadoId(null);
      return;
    }
    if (!kitsState.kits.some((kit) => kit.id === selecionadoId)) {
      setSelecionadoId(kitsState.kits[0].id);
    }
  }, [kitsState.kits, selecionadoId]);

  const selecionado =
    kitsState.kits.find((kit) => kit.id === selecionadoId) ?? null;

  async function excluir(kit: Kit) {
    if (!window.confirm(`Excluir o Kit “${kit.nome}”, seu mapa associado e todas as marcações desse mapa?`)) return;
    try {
      await kitsState.excluir(kit.id);
      onMensagem(`Kit “${kit.nome}” e mapa associado excluídos.`);
    } catch (falha) {
      onMensagem(traduzirErro(falha).mensagem);
    }
  }

  return (
    <section className="kits-page" aria-labelledby="kits-titulo">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Estoque · consumo por unidade</p>
          <h2 id="kits-titulo">Central de Kits</h2>
          <p>Um Kit representa a composição teórica necessária para executar o serviço em uma unidade.</p>
        </div>
        <button className="button button--primary" type="button" onClick={() => setEditor("novo")}>+ Criar Kit</button>
      </div>

      {kitsState.carregando ? (
        <div className="section-loading">Carregando Kits…</div>
      ) : kitsState.kits.length === 0 ? (
        <div className="kits-empty">
          <span aria-hidden="true">▦</span>
          <h3>Nenhum Kit cadastrado</h3>
          <p>Crie o primeiro Kit e informe os materiais necessários para uma unidade.</p>
          <button className="button button--primary" type="button" onClick={() => setEditor("novo")}>Criar primeiro Kit</button>
        </div>
      ) : (
        <div className="kits-layout">
          <aside className="kits-list" aria-label="Kits cadastrados">
            <div className="kits-list__heading"><span>Kits cadastrados</span><strong>{kitsState.kits.length}</strong></div>
            {kitsState.kits.map((kit) => (
              <button
                type="button"
                className={`kit-list-item${kit.id === selecionadoId ? " kit-list-item--active" : ""}`}
                key={kit.id}
                onClick={() => setSelecionadoId(kit.id)}
              >
                <span className="kit-list-item__icon" aria-hidden="true">▦</span>
                <span><strong>{kit.nome}</strong><small>{kit.unidadeIds.length} unidades aplicáveis · {kit.materiais.length} materiais</small><small>Mapa: {kit.nome}</small></span>
              </button>
            ))}
          </aside>
          {selecionado && (
            <KitDetalhes
              kit={selecionado}
              onEditar={() => setEditor(selecionado)}
              onExcluir={() => void excluir(selecionado)}
              onVincular={() => setVinculando(selecionado)}
              onAbrirMapa={() => onAbrirMapa(selecionado.mapaId)}
            />
          )}
        </div>
      )}

      {editor && (
        <KitEditorModal
          key={editor === "novo" ? "novo" : editor.id}
          kit={editor === "novo" ? null : editor}
          onFechar={() => setEditor(null)}
          onSalvar={async (dados) => {
            const id = await kitsState.salvar(dados);
            setSelecionadoId(id);
            setEditor(null);
            onMensagem(`Kit “${dados.nome.trim()}” salvo.`);
          }}
        />
      )}

      {vinculando && (
        <KitUnidadesModal
          key={vinculando.id}
          kit={vinculando}
          onFechar={() => setVinculando(null)}
          onSalvar={async (selecionadas) => {
            await kitsState.vincular(vinculando.id, selecionadas);
            setVinculando(null);
            onMensagem(`${selecionadas.length} unidade(s) vinculada(s) ao Kit “${vinculando.nome}”.`);
          }}
        />
      )}
    </section>
  );
}

interface KitDetalhesProps {
  kit: Kit;
  onEditar: () => void;
  onExcluir: () => void;
  onVincular: () => void;
  onAbrirMapa: () => void;
}

function KitDetalhes({ kit, onEditar, onExcluir, onVincular, onAbrirMapa }: KitDetalhesProps) {
  const materiais = kit.materiais;
  return (
    <article className="kit-details">
      <header className="kit-details__header">
        <div><p className="eyebrow">Resumo de utilização</p><h3>{kit.nome}</h3></div>
        <div className="kit-details__actions">
          <button className="button button--secondary" type="button" onClick={onAbrirMapa} disabled={!kit.mapaId}>Abrir mapa</button>
          <button className="button button--secondary" type="button" onClick={onEditar}>Editar</button>
          <button className="button button--secondary" type="button" onClick={onVincular}>Selecionar unidades</button>
          <button className="icon-button icon-button--danger" type="button" onClick={onExcluir} aria-label="Excluir Kit">×</button>
        </div>
      </header>
      <div className="kit-metrics">
        <div><span>Unidades aplicáveis</span><strong>{kit.unidadeIds.length}</strong></div>
        <div><span>Materiais no Kit</span><strong>{kit.materiais.length}</strong></div>
        <div><span>Referências SIENGE</span><strong>{kit.materiais.filter(item => item.codigoSienge).length}</strong></div>
      </div>
      <section className="kit-map-link" aria-label="Mapa associado">
        <div><span>Mapa associado</span><strong>{kit.nome}</strong></div>
        <button className="link-button" type="button" onClick={onAbrirMapa} disabled={!kit.mapaId}>Abrir em Mapas e Marcações</button>
      </section>
      <section className="kit-section">
        <div className="kit-section__heading"><div><p className="field-label">Composição teórica</p><h4>Materiais por unidade aplicável</h4></div><small>Não representa movimentação de estoque</small></div>
        {kit.materiais.some(item => item.disponibilidadeManual !== null) && <p className="kit-section__empty">Disponibilidade informada manualmente · atualização do Kit: {new Date(kit.atualizadoEm).toLocaleString("pt-BR")}{kit.atualizadoPor ? ` · por ${kit.atualizadoPor}` : ""}</p>}
        <div className="kit-table-wrap">
          <table className="kit-table">
            <thead><tr><th>Referência SIENGE</th><th>Descrição</th><th>Detalhe</th><th>Por unidade</th><th>Disponibilidade informada</th></tr></thead>
            <tbody>
              {materiais.map((material) => (
                <tr key={material.id}>
                  <td><code>{material.codigoSienge || "Não vinculada"}</code></td>
                  <td><strong>{material.descricao}</strong></td>
                  <td>{material.detalhe}</td>
                  <td>{formatarQuantidade(material.quantidadePorKit)} {material.unidadeMedida}</td>
                  <td><strong className="consumption-value">{material.disponibilidadeManual === null ? "Não informada" : `${formatarQuantidade(material.disponibilidadeManual)} ${material.unidadeMedida}`}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="kit-section">
        <div className="kit-section__heading"><div><p className="field-label">Unidades da planta</p><h4>Unidades às quais este serviço se aplica</h4></div></div>
        {kit.unidadeIds.length ? (
          <div className="unit-chips">
            {kit.unidadeIds.map((id) => {
              const unidade = UNIDADE_BY_ID[id];
              return unidade ? <span key={id}>Bloco {unidade.bloco} · {unidade.numero}</span> : null;
            })}
          </div>
        ) : <p className="kit-section__empty">Nenhuma unidade vinculada.</p>}
      </section>
    </article>
  );
}

interface KitEditorModalProps {
  kit: Kit | null;
  onFechar: () => void;
  onSalvar: (dados: DadosKit) => Promise<void>;
}

function KitEditorModal({ kit, onFechar, onSalvar }: KitEditorModalProps) {
  const [nome, setNome] = useState(kit?.nome ?? "");
  const [materiais, setMateriais] = useState<MaterialKit[]>(
    kit?.materiais.map((material) => ({ ...material })) ?? [materialVazio()],
  );
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function atualizarMaterial(id: string, campo: keyof MaterialKit, valor: string | number | null) {
    setMateriais((atuais) => atuais.map((material) => material.id === id ? { ...material, [campo]: valor } : material));
  }

  async function salvar(event: React.FormEvent) {
    event.preventDefault();
    if (!nome.trim()) return setErro("Informe o nome do Kit.");
    if (materiais.length === 0) return setErro("Adicione pelo menos um material.");
    if (materiais.some((material) => !material.descricao.trim() || material.quantidadePorKit <= 0 || !material.unidadeMedida.trim())) {
      return setErro("Preencha descrição, unidade de medida e uma quantidade maior que zero em todos os materiais.");
    }
    const codigos = materiais.map((material) => material.codigoSienge.trim().toLocaleLowerCase()).filter(Boolean);
    if (new Set(codigos).size !== codigos.length) return setErro("O mesmo Cód. Sienge aparece mais de uma vez neste Kit.");
    setSalvando(true);
    setErro(null);
    try {
      await onSalvar({
        id: kit?.id,
        nome: nome.trim(),
        materiais: materiais.map((material) => ({
          ...material,
          codigoSienge: material.codigoSienge.trim(),
          descricao: material.descricao.trim(),
          detalhe: material.detalhe.trim(),
        })),
      });
    } catch (falha) {
      setErro(traduzirErro(falha).mensagem);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onFechar}>
      <section className="modal-card modal-card--kit" role="dialog" aria-modal="true" aria-labelledby="kit-editor-titulo" onMouseDown={(event) => event.stopPropagation()}>
        <div className="manager-heading"><div><p className="eyebrow">Central de Kits</p><h2 id="kit-editor-titulo">{kit ? "Editar Kit" : "Criar Kit"}</h2><p>As quantidades informadas representam o consumo de uma unidade.</p></div><button className="icon-button" type="button" onClick={onFechar} aria-label="Fechar">×</button></div>
        <form className="kit-form" onSubmit={salvar}>
          <label htmlFor="kit-nome">Nome do Kit</label>
          <input id="kit-nome" value={nome} maxLength={80} onChange={(event) => setNome(event.target.value)} placeholder="Ex.: Kit Hidráulico" required />
          <p className="kit-map-preview">
            <span>Mapa associado</span>
            <strong>{nome.trim() || "Mesmo nome do Kit"}</strong>
            <small>{kit ? "O mapa existente será renomeado junto com o Kit." : "O mapa será criado automaticamente ao salvar."}</small>
          </p>
          <div className="material-form-heading"><div><p className="field-label">Materiais</p><strong>{materiais.length} item(ns)</strong></div><button className="button button--ghost" type="button" onClick={() => setMateriais((atuais) => [...atuais, materialVazio()])}>+ Adicionar material</button></div>
          <div className="materials-editor">
            {materiais.map((material, indice) => (
              <fieldset className="material-editor" key={material.id}>
                <legend>Material {indice + 1}</legend>
                <label>Referência SIENGE (opcional)<input value={material.codigoSienge} maxLength={32} onChange={(event) => atualizarMaterial(material.id, "codigoSienge", event.target.value)} /></label>
                <label>Descrição<input value={material.descricao} maxLength={100} onChange={(event) => atualizarMaterial(material.id, "descricao", event.target.value)} required /></label>
                <label className="material-editor__detail">Detalhe (opcional)<input value={material.detalhe} maxLength={180} placeholder="Pode ficar em branco" onChange={(event) => atualizarMaterial(material.id, "detalhe", event.target.value)} /></label>
                <label>Unidade de medida<input value={material.unidadeMedida} maxLength={12} placeholder="un, m, kg, L…" onChange={(event) => atualizarMaterial(material.id, "unidadeMedida", event.target.value)} required /></label>
                <label>Quantidade por unidade<input type="number" min="0.001" step="0.001" value={material.quantidadePorKit} onChange={(event) => atualizarMaterial(material.id, "quantidadePorKit", Number(event.target.value))} required /></label>
                <label>Disponibilidade informada (opcional)<input type="number" min="0" step="0.001" value={material.disponibilidadeManual ?? ""} placeholder="Desconhecida" onChange={(event) => atualizarMaterial(material.id, "disponibilidadeManual", event.target.value === "" ? null : Number(event.target.value))} /><small>Fonte manual · atualizada ao salvar o Kit</small></label>
                {materiais.length > 1 && <button className="material-editor__remove" type="button" onClick={() => setMateriais((atuais) => atuais.filter((item) => item.id !== material.id))}>Remover</button>}
              </fieldset>
            ))}
          </div>
          {erro && <p className="form-error" role="alert">{erro}</p>}
          <div className="modal-card__acoes"><button className="button button--ghost" type="button" onClick={onFechar}>Cancelar</button><button className="button button--primary" type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Salvar Kit"}</button></div>
        </form>
      </section>
    </div>
  );
}

interface KitUnidadesModalProps {
  kit: Kit;
  onFechar: () => void;
  onSalvar: (unidadeIds: string[]) => Promise<void>;
}

function KitUnidadesModal({ kit, onFechar, onSalvar }: KitUnidadesModalProps) {
  const [selecionadas, setSelecionadas] = useState(() => new Set(kit.unidadeIds));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const totalConsumo = useMemo(
    () => kit.materiais.reduce((total, material) => total + material.quantidadePorKit * selecionadas.size, 0),
    [kit.materiais, selecionadas],
  );

  function alternar(id: string) {
    setSelecionadas((atuais) => {
      const proximas = new Set(atuais);
      if (proximas.has(id)) proximas.delete(id);
      else proximas.add(id);
      return proximas;
    });
  }

  async function confirmar() {
    setSalvando(true);
    setErro(null);
    try {
      await onSalvar([...selecionadas]);
    } catch (falha) {
      setErro(traduzirErro(falha).mensagem);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onFechar}>
      <section className="modal-card modal-card--units" role="dialog" aria-modal="true" aria-labelledby="kit-unidades-titulo" onMouseDown={(event) => event.stopPropagation()}>
        <div className="manager-heading"><div><p className="eyebrow">Kit · {kit.nome}</p><h2 id="kit-unidades-titulo">Selecionar unidades aplicáveis</h2><p>Marque onde este serviço e sua composição teórica se aplicam.</p></div><button className="icon-button" type="button" onClick={onFechar} aria-label="Fechar">×</button></div>
        <div className="units-selection-summary"><div><span>Selecionadas</span><strong>{selecionadas.size}</strong></div><div><span>Itens calculados</span><strong>{formatarQuantidade(totalConsumo)}</strong></div><div className="units-selection-actions"><button className="link-button" type="button" onClick={() => setSelecionadas(new Set(UNIDADES.map((unidade) => unidade.id)))}>Selecionar todas</button><button className="link-button" type="button" onClick={() => setSelecionadas(new Set())}>Limpar</button></div></div>
        <div className="unit-selector">
          {BLOCOS.map((bloco) => (
            <fieldset key={bloco.id}><legend>{bloco.nome}</legend><div>
              {[...bloco.unidades].sort((a, b) => a.numero.localeCompare(b.numero)).map((unidade) => (
                <label className={selecionadas.has(unidade.id) ? "unit-option unit-option--selected" : "unit-option"} key={unidade.id}>
                  <input type="checkbox" checked={selecionadas.has(unidade.id)} onChange={() => alternar(unidade.id)} />
                  <span>{unidade.numero}</span>
                </label>
              ))}
            </div></fieldset>
          ))}
        </div>
        {erro && <p className="form-error" role="alert">{erro}</p>}
        <div className="modal-card__acoes"><button className="button button--ghost" type="button" onClick={onFechar}>Cancelar</button><button className="button button--primary" type="button" disabled={salvando} onClick={() => void confirmar()}>{salvando ? "Salvando…" : `Salvar ${selecionadas.size} unidade(s)`}</button></div>
      </section>
    </div>
  );
}
