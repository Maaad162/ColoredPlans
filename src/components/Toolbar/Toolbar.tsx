import { useRef } from "react";
import type {
  Bloco,
  FerramentaPintura,
  StatusConfig,
  StatusFilter,
} from "../../types/planta";
import { Icon } from "../Icon";
import { PaletaStatus } from "../PaletaStatus/PaletaStatus";

interface ToolbarProps {
  blocos: Bloco[];
  legendas: StatusConfig[];
  nomeMapaAtivo: string;
  blocoFiltro: string;
  statusFiltro: StatusFilter;
  statusPincel: FerramentaPintura | null;
  zoom: number;
  onBlocoFiltro: (bloco: string) => void;
  onStatusFiltro: (status: StatusFilter) => void;
  onStatusPincel: (status: FerramentaPintura | null) => void;
  onZoom: (zoom: number) => void;
  onExportar: () => void;
  onExportarCsv: () => void;
  onImportar: (arquivo: File) => void;
  onLimparTudo: () => void;
  onLimparFiltros: () => void;
  responsaveis: string[];
  responsavelFiltro: string;
  onResponsavelFiltro: (responsavel: string) => void;
}

export function Toolbar({
  blocos,
  legendas,
  nomeMapaAtivo,
  blocoFiltro,
  statusFiltro,
  statusPincel,
  zoom,
  onBlocoFiltro,
  onStatusFiltro,
  onStatusPincel,
  onZoom,
  onExportar,
  onExportarCsv,
  onImportar,
  onLimparTudo,
  onLimparFiltros,
  responsaveis,
  responsavelFiltro,
  onResponsavelFiltro,
}: ToolbarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="toolbar" aria-label="Ferramentas da planta">
      <div className="toolbar__filtros">
        <div className="select-field">
          <label htmlFor="filtro-bloco">Bloco</label>
          <div className="select-field__control">
            <Icon name="home" size={16} />
            <select
              id="filtro-bloco"
              value={blocoFiltro}
              onChange={(event) => onBlocoFiltro(event.target.value)}
            >
              <option value="todos">Todos os blocos</option>
              {blocos.map((bloco) => (
                <option key={bloco.id} value={bloco.id}>{bloco.nome}</option>
              ))}
            </select>
          </div>
        </div>
        {responsaveis.length > 0 && <div className="select-field"><label htmlFor="filtro-responsavel">Responsável</label><div className="select-field__control">
          <Icon name="filter" size={16} /><select id="filtro-responsavel" value={responsavelFiltro} onChange={event => onResponsavelFiltro(event.target.value)}>
            <option value="todos">Todos</option>{responsaveis.map(item => <option key={item} value={item}>{item}</option>)}
          </select></div></div>}
        {(blocoFiltro !== "todos" || statusFiltro !== "todos" || responsavelFiltro !== "todos") && <button className="link-button" type="button" onClick={onLimparFiltros}>Limpar filtros</button>}

        <div className="select-field">
          <label htmlFor="filtro-status">Status</label>
          <div className="select-field__control">
            <Icon name="filter" size={16} />
            <select
              id="filtro-status"
              value={statusFiltro}
              onChange={(event) => onStatusFiltro(event.target.value as StatusFilter)}
            >
              <option value="todos">Todos os status</option>
              <optgroup label="Situação operacional">
                <option value="categoria:concluido">Concluídos</option><option value="categoria:andamento">Em andamento</option>
                <option value="categoria:bloqueado">Bloqueados/pendências</option><option value="categoria:nao-iniciado">Não iniciados</option>
              </optgroup>
              <optgroup label="Legendas">
              {legendas.map((status) => (
                <option key={status.id} value={status.id}>{status.nome}</option>
              ))}
              </optgroup>
              <option value="sem-marcacao">Sem marcação</option>
            </select>
          </div>
        </div>
      </div>

      <div className="toolbar__pincel">
        <div className="toolbar__label">
          <Icon name="paint" size={16} />
          <span>Pintura rápida</span>
        </div>
        <PaletaStatus
          valor={statusPincel}
          legendas={legendas}
          onChange={(status) => {
            const ferramenta: FerramentaPintura = status ?? "sem-marcacao";
            onStatusPincel(ferramenta === statusPincel ? null : ferramenta);
          }}
          compacta
          incluirLimpar
        />
        {statusPincel && (
          <button className="link-button" type="button" onClick={() => onStatusPincel(null)}>
            Desativar
          </button>
        )}
      </div>

      <div className="toolbar__acoes">
        <div className="zoom-control" aria-label="Controles de zoom">
          <button
            type="button"
            onClick={() => onZoom(Math.max(0.65, zoom - 0.1))}
            aria-label="Diminuir zoom"
          >
            <Icon name="minus" size={16} />
          </button>
          <button type="button" className="zoom-control__valor" onClick={() => onZoom(1)}>
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={() => onZoom(Math.min(2.5, zoom + 0.1))}
            aria-label="Aumentar zoom"
          >
            <Icon name="plus" size={16} />
          </button>
          <button type="button" onClick={() => onZoom(0.8)} aria-label="Ajustar à tela" title="Ajustar à tela">
            <Icon name="fit" size={16} />
          </button>
        </div>

        <div className="action-menu">
          <button className="button button--secondary" type="button" onClick={onExportar} title="Exportar mapa ativo em JSON">
            <Icon name="download" />
            <span>JSON</span>
          </button>
          <button className="button button--secondary" type="button" onClick={onExportarCsv} title="Exportar todos os mapas em CSV">
            <Icon name="download" />
            <span>CSV de todos os mapas</span>
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => inputRef.current?.click()}
          >
            <Icon name="upload" />
            <span>Importar</span>
          </button>
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const arquivo = event.target.files?.[0];
              if (arquivo) onImportar(arquivo);
              event.currentTarget.value = "";
            }}
          />
          <button
            className="icon-button icon-button--danger"
            type="button"
            onClick={onLimparTudo}
            title={`Limpar marcações de ${nomeMapaAtivo}`}
            aria-label={`Limpar todas as marcações da aba ${nomeMapaAtivo}`}
          >
            <Icon name="trash" />
          </button>
        </div>
      </div>
    </div>
  );
}
