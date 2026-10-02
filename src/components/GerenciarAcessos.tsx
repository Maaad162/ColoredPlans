import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { db } from "../config/firebase";
import { lerHierarquia, NOMES_NIVEIS, type HierarquiaUsuario, type NivelHierarquico } from "../services/hierarquia";
import { traduzirErro } from "../services/erros";
import { useControleSync } from "../hooks/useSincronizacao";
import type { Obra, TipoConta } from "../types/planta";

interface Membro extends HierarquiaUsuario { id: string; email: string; tipoConta: TipoConta }
const SUPERIOR: Partial<Record<NivelHierarquico, NivelHierarquico>> = {
  tecnico: "engenheiro", engenheiro: "coordenador", coordenador: "gestor", gestor: "dev",
};

export function GerenciarAcessos({ espacoId, usuarioId, obras }: { espacoId: string; usuarioId: string; obras: Obra[] }) {
  const [aberto, setAberto] = useState(false);
  return <><button className="button button--secondary" type="button" onClick={() => setAberto(true)}>Gerenciar acessos</button>
    {aberto && <EditorAcessos espacoId={espacoId} usuarioId={usuarioId} obras={obras} fechar={() => setAberto(false)} />}</>;
}

function EditorAcessos({ espacoId, usuarioId, obras, fechar }: { espacoId: string; usuarioId: string; obras: Obra[]; fechar: () => void }) {
  const [membros, setMembros] = useState<Membro[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  useEffect(() => onSnapshot(query(collection(db, "usuarios"), where("espacoId", "==", espacoId)), snapshot => {
    try {
      setMembros(snapshot.docs.map(item => {
        const data = item.data();
        if (data.schemaVersion !== 2 || (data.tipoConta !== "estoque" && data.tipoConta !== "apontamento")) throw new Error("Perfil inválido.");
        return { id: item.id, email: String(data.email ?? item.id), tipoConta: data.tipoConta, ...lerHierarquia(data, item.id) };
      }));
      setErro(""); setCarregando(false);
    } catch { setErro("Há um perfil inválido. Solicite revisão administrativa."); setMembros([]); setCarregando(false); }
  }, falha => { setErro(traduzirErro(falha).mensagem); setMembros([]); setCarregando(false); }), [espacoId]);
  const membro = membros.find(item => item.id === editando);
  return <div className="modal-backdrop"><section className="modal-card modal-card--wide access-manager" role="dialog" aria-modal="true" aria-labelledby="acessos-titulo">
    <div className="manager-heading"><h2 id="acessos-titulo">Gerenciar acessos</h2><button className="icon-button" onClick={fechar} aria-label="Fechar acessos">×</button></div>
    <p>Contas são provisionadas administrativamente. A alteração de nível exige revisão da hierarquia pelo administrador.</p>
    {erro && <p role="alert">{erro}</p>}
    {carregando ? <p role="status">Carregando perfis…</p> : <ul>{membros.map(item => <li key={item.id}>
      {item.email} · {NOMES_NIVEIS[item.nivel]} · {item.tipoConta}
      {item.id !== usuarioId && item.nivel !== "dev" && <button className="link-button" onClick={() => setEditando(item.id)} aria-label={`Editar ${item.email}`}>Editar acessos</button>}
    </li>)}</ul>}
    {membro && membro.id !== usuarioId && membro.nivel !== "dev" && <FormularioAcessos key={JSON.stringify(membro)} membro={membro} membros={membros} obras={obras} aoSalvar={() => setEditando(null)} />}
  </section></div>;
}

function FormularioAcessos({ membro, membros, obras, aoSalvar }: { membro: Membro; membros: Membro[]; obras: Obra[]; aoSalvar: () => void }) {
  const controle = useControleSync();
  const [tipoConta, setTipoConta] = useState<TipoConta>(membro.tipoConta);
  const [superiorId, setSuperiorId] = useState(membro.superiorId ?? "");
  const [obraIds, setObraIds] = useState(membro.obraIds);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  return <form className="unit-context" onSubmit={event => {
    event.preventDefault(); setSalvando(true); setErro("");
    void controle.executar(`acessos:${membro.id}`, () => updateDoc(doc(db, "usuarios", membro.id), { tipoConta, superiorId, obraIds }), `Acessos · ${membro.email}`)
      .then(aoSalvar).catch(falha => setErro(traduzirErro(falha).mensagem)).finally(() => setSalvando(false));
  }}>
    <h3>{membro.email}</h3><p>Nível: {NOMES_NIVEIS[membro.nivel]}</p>
    <label htmlFor="acesso-setor">Setor</label><select id="acesso-setor" value={tipoConta} onChange={event => setTipoConta(event.target.value as TipoConta)}><option value="apontamento">Apontamento</option><option value="estoque">Estoque</option></select>
    <label htmlFor="acesso-superior">Superior</label><select id="acesso-superior" required value={superiorId} onChange={event => setSuperiorId(event.target.value)}><option value="">Selecione</option>
      {membros.filter(item => item.nivel === SUPERIOR[membro.nivel]).map(item => <option key={item.id} value={item.id}>{item.email}</option>)}</select>
    {membro.nivel === "gestor" ? <p>Gestor consulta todas as obras deste espaço.</p> : <fieldset><legend>Obras atribuídas</legend>
      {obras.map(obra => <label key={obra.id}><input type="checkbox" checked={obraIds.includes(obra.id)} onChange={event => setObraIds(ids => event.target.checked ? [...ids, obra.id] : ids.filter(id => id !== obra.id))} />{obra.nome}</label>)}
    </fieldset>}
    <p>O vínculo com o superior não concede obras automaticamente. Cada acesso é atribuído explicitamente.</p>
    {erro && <p role="alert">{erro}</p>}
    <button className="button button--primary" type="submit" disabled={salvando || obraIds.length > 30}>{salvando ? "Salvando…" : "Salvar acessos"}</button>
  </form>;
}
