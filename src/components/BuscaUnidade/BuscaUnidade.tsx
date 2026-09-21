import { useState } from "react";
import type { Unidade } from "../../types/planta";

export function BuscaUnidade({ unidades, onSelecionar }: {
  unidades: Unidade[];
  onSelecionar: (id: string) => void;
}) {
  const [numero, setNumero] = useState("");
  const consulta = numero.trim();
  const resultados = consulta ? unidades.filter(unidade => /^\d+$/.test(consulta)
    ? Number(unidade.numero) === Number(consulta)
    : `${unidade.numero} ${unidade.label ?? ""}`.toLocaleLowerCase("pt-BR").includes(consulta.toLocaleLowerCase("pt-BR"))) : [];
  return (
    <section className="busca-unidade" aria-label="Busca por unidade">
      <label htmlFor="busca-unidade">Buscar número da unidade</label>
      <input id="busca-unidade" type="search" inputMode="numeric" value={numero}
        placeholder="Ex.: 001" onChange={(event) => setNumero(event.target.value)} />
      {consulta && <div className="busca-unidade__resultados" aria-live="polite">
        {resultados.length === 0 ? <span>Nenhuma unidade encontrada.</span> : resultados.map((unidade) => (
          <button className="button button--secondary" type="button" key={unidade.id}
            onClick={() => onSelecionar(unidade.id)}>
            Bloco {unidade.bloco} · Unidade {unidade.numero}
          </button>
        ))}
      </div>}
    </section>
  );
}
