import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { LIRIOS_OBRA_ID, LIRIOS_PLANTA_ID, LIRIOS_TEMPLATE_ID, LIRIOS_DEFINICAO } from '../src/data/liriosDoValeII.ts';
import { prepararProvisionamento } from '../src/services/provisionamento.ts';
export function criarConfigLirios() {
  return {version:1,obra:{id:LIRIOS_OBRA_ID,nome:'Lírios do Vale II'},
    templates:[{id:LIRIOS_TEMPLATE_ID,definicao:LIRIOS_DEFINICAO}],
    plantas:[{id:LIRIOS_PLANTA_ID,nome:'Implantação — Lírios do Vale II',templateId:LIRIOS_TEMPLATE_ID}],equipes:[]};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args=process.argv.slice(2);
  if (args.length && (args.length!==2 || args[0]!=='--arquivo' || !args[1])) throw new Error('Use sem argumentos ou --arquivo caminho.json; não acessa Firebase.');
  const config=criarConfigLirios();
  prepararProvisionamento(config,'validacao-local');
  const json=JSON.stringify(config,null,2)+'\n';
  if(args.length) writeFileSync(args[1],json,{encoding:'utf8',flag:'wx'});
  else process.stdout.write(json);
}
