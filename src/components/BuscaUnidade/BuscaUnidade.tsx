import { useState } from "react";
import { rotuloDaUnidade } from "../../services/geometria";
import type { Unidade } from "../../types/planta";

export function BuscaUnidade({ unidades, onSelecionar }: {
  unidades: Unidade[];
  onSelecionar: (id: string) => void;
}) {
  const [numero, setNumero] = useState("");
  const consulta = numero.trim();
  const temAreas = unidades.some(unidade => unidade.tipo === "area-comum");
  const resultados = consulta ? unidades.filter(unidade => /^\d+$/.test(consulta)
    ? unidade.tipo !== "area-comum" && Number(unidade.numero) === Number(consulta)
    : `${unidade.numero} ${unidade.label ?? ""}`.toLocaleLowerCase("pt-BR").includes(consulta.toLocaleLowerCase("pt-BR"))) : [];
  return (
    <section className="busca-unidade" aria-label="Busca por unidade">
      <label htmlFor="busca-unidade">{temAreas ? "Buscar unidade ou área comum" : "Buscar número da unidade"}</label>
      <input id="busca-unidade" type="search" inputMode={temAreas ? "search" : "numeric"} value={numero}
        placeholder={temAreas ? "Ex.: 001, parque" : "Ex.: 001"} onChange={(event) => setNumero(event.target.value)} />
      {consulta && <div className="busca-unidade__resultados" aria-live="polite">
        {resultados.length === 0 ? <span>Nenhuma unidade encontrada.</span> : resultados.map((unidade) => (
          <button className="button button--secondary" type="button" key={unidade.id}
            onClick={() => onSelecionar(unidade.id)}>
            {rotuloDaUnidade(unidade)}
          </button>
        ))}
      </div>}
    </section>
  );
}
