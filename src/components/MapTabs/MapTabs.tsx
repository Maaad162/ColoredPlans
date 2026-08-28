import { useEffect, useRef, useState } from "react";
import type { MapaServico } from "../../types/planta";
import { Icon } from "../Icon";

interface MapTabsProps {
  abas: MapaServico[];
  abaAtivaId: string;
  onSelecionar: (id: string) => void;
  onCriar: (nome: string) => boolean;
  onExcluir: (id: string, nome: string) => void;
}

export function MapTabs({
  abas,
  abaAtivaId,
  onSelecionar,
  onCriar,
  onExcluir,
}: MapTabsProps) {
  const [modalAberto, setModalAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!modalAberto) return;
    inputRef.current?.focus();

    function fecharComEscape(event: KeyboardEvent) {
      if (event.key === "Escape") fecharModal();
    }
    window.addEventListener("keydown", fecharComEscape);
    return () => window.removeEventListener("keydown", fecharComEscape);
  }, [modalAberto]);

  function fecharModal() {
    setModalAberto(false);
    setNome("");
    setErro(null);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!nome.trim()) {
      setErro("Digite um nome para a nova aba.");
      return;
    }
    if (!onCriar(nome)) {
      setErro("Já existe uma aba com esse nome.");
      return;
    }
    fecharModal();
  }

  function handleExcluir(aba: MapaServico) {
    if (aba.tipo === "kit") return;
    const totalMarcado = Object.values(aba.marcacoes).filter(Boolean).length;
    const detalhe = totalMarcado
      ? ` Ela contém ${totalMarcado} unidade${totalMarcado === 1 ? "" : "s"} marcada${
          totalMarcado === 1 ? "" : "s"
        }.`
      : "";
    const confirmado = window.confirm(
      `Tem certeza que deseja apagar a aba “${aba.nome}”?${detalhe} Esta ação não pode ser desfeita.`,
    );
    if (confirmado) onExcluir(aba.id, aba.nome);
  }

  return (
    <>
      <nav className="map-tabs-shell" aria-label="Mapas de serviço">
        <div className="map-tabs__label">
          <span>Mapas de serviço</span>
          <strong>{abas.length}</strong>
        </div>
        <div className="map-tabs" role="tablist" aria-label="Serviços da obra">
          {abas.map((aba) => {
            const ativa = aba.id === abaAtivaId;
            const totalMarcado =
              aba.tipo === "kit"
                ? aba.kitUnidadeIds.length
                : Object.values(aba.marcacoes).filter(Boolean).length;
            return (
              <div
                className={`map-tab-item${ativa ? " map-tab-item--ativa" : ""}`}
                key={aba.id}
                role="presentation"
              >
                <button
                  id={`tab-${aba.id}`}
                  type="button"
                  role="tab"
                  aria-selected={ativa}
                  aria-controls="mapa-tab-panel"
                  className={`map-tab${ativa ? " map-tab--ativa" : ""}`}
                  onClick={() => onSelecionar(aba.id)}
                >
                  <span className={`map-tab__dot${aba.tipo === "kit" ? " map-tab__dot--kit" : ""}`} aria-hidden="true" />
                  <span>{aba.nome}</span>
                  <small title={`${totalMarcado} ${aba.tipo === "kit" ? "unidades com Kit" : "unidades marcadas"}`}>
                    {totalMarcado}
                  </small>
                </button>
                {abas.length > 1 && aba.tipo !== "kit" && (
                  <button
                    type="button"
                    className="map-tab__delete"
                    onClick={() => handleExcluir(aba)}
                    aria-label={`Apagar aba ${aba.nome}`}
                    title={`Apagar ${aba.nome}`}
                  >
                    <Icon name="close" size={12} />
                  </button>
                )}
              </div>
            );
          })}
          <button
            type="button"
            className="map-tab map-tab--nova"
            onClick={() => setModalAberto(true)}
          >
            <Icon name="plus" size={15} />
            <span>Nova aba</span>
          </button>
        </div>
      </nav>

      {modalAberto && (
        <div className="modal-backdrop" onMouseDown={fecharModal}>
          <section
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="nova-aba-titulo"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-card__icone" aria-hidden="true">
              <Icon name="plus" size={20} />
            </div>
            <div className="modal-card__titulo">
              <p className="eyebrow">Novo mapa</p>
              <h2 id="nova-aba-titulo">Criar aba de serviço</h2>
              <p>
                A nova aba usará a mesma planta e começará sem marcações.
              </p>
            </div>
            <form onSubmit={handleSubmit}>
              <label htmlFor="nome-nova-aba">Nome do serviço</label>
              <input
                ref={inputRef}
                id="nome-nova-aba"
                value={nome}
                maxLength={48}
                placeholder="Ex.: Pintura, Cerâmica, Elétrica"
                onChange={(event) => {
                  setNome(event.target.value);
                  setErro(null);
                }}
                aria-invalid={Boolean(erro)}
                aria-describedby={erro ? "nova-aba-erro" : undefined}
              />
              {erro && <p className="form-error" id="nova-aba-erro">{erro}</p>}
              <div className="modal-card__acoes">
                <button type="button" className="button button--ghost" onClick={fecharModal}>
                  Cancelar
                </button>
                <button type="submit" className="button button--primary">
                  Criar aba
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
