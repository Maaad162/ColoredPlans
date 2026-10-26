# Piloto Lírios do Vale II — sem hierarquia de usuários

Base: última main anterior à hierarquia, commit 5885418 (v1.6.0).
Inclui geometria funcional e áreas comuns; preserva Rules, perfis schema 0/1 e isolamento privado por UID.
Não contém níveis de usuário, superiorId, espacoId, obraIds ou gestão DEV. Setor tipoConta segue apontamento/estoque.
O teste não migra nem altera dados de produção. A main com hierarquia continua preservada para entrega posterior.

## Ambiente local

Execute npm run dev:lirios e abra http://127.0.0.1:5173. Não execute suítes que usam emuladores simultaneamente.
Com emuladores Auth9099/Firestore8080 locais explícitos, npm run seed:lirios reprovisiona apenas contas reservadas, preservando mapas/contextos existentes.
O seed aceita somente demo-coloredplans e hosts locais. Não existe reset ou parâmetro para produção.
Credenciais exclusivamente LOCAIS, nunca usar em produção:
- Estoque: piloto.lirios@coloredplans.local
- Apontamento: apontamento.lirios@coloredplans.local
- Senha local comum: ColoredPlans@Piloto2026
Cada conta mantém seus dados privados no próprio UID, conforme o modelo legado; não são cópias de dados reais.
Setor Estoque acessa Kits; Apontamento mantém marcações/contextos/mapas e não gerencia Kits.

## Homologação e provisionamento real

Usar projeto Firebase de homologação explicitamente confirmado, com contas reais provisionadas administrativamente e perfis schema1.
Contas do seed não são enviadas ao Authentication real. A geometria pode ser exportada para plano do provisionador existente, por UID autorizado.
Não basta criar canal preview: Hosting preview pode continuar usando o mesmo backend; conferir o projectId efetivo antes de qualquer publicação.
Não publicar Rules ou migrar perfis da main combinada neste piloto. As Rules deste ramo devem permanecer idênticas à base5885418.
Jardim das Tulipas I conserva ID obra-principal e não é alterado pelo seed piloto.
IDs do novo mapa: obra lirios-do-vale-ii, template lirios-v1, planta implantacao-lirios.
Referência: [imagem original](referencias/lirios-do-vale-ii.png).

## Leitura da imagem

| Faixa da imagem | Esquerda | Direita | Unidades |
| --- | --- | --- | --- |
| Norte/superior | Bloco 08 | Bloco 07 | 16 + 12 |
| Central superior | Bloco 05 | Bloco 06 | 12 + 12 |
| Central inferior | Bloco 04 | Bloco 03 | 12 + 12 |
| Sul/inferior | Bloco 01 | Bloco 02 | 12 + 12 |

Total: **100 moradias**, não 108 apartamentos. Bloco 08 tem 101–108 sobre
001–008; Bloco 07 tem 101–106 sobre 001–006, ambos crescendo para a direita.
Nos blocos 01–06 as linhas são 106–101 e 006–001, decrescendo para a direita.
Os números repetidos em blocos diferentes conservam identidades próprias.

São ainda **8 áreas comuns operacionais**, sem bloco habitacional fictício:
quatro bicicletários (noroeste junto do 08, oeste sob o 04, sudoeste e lateral
leste), resíduos a oeste, parque à direita dos resíduos, academia estreita
abaixo do parque e centro comunitário no sul à esquerda do Bloco 01.
Cada uma pode receber marcação/contexto e ser incluída em Kits por quem já tem permissão.
Os totais operacionais podem abranger 108 itens: 100 moradias + 8 áreas, explicitamente distintos.

## Interpretações e limites

- As coordenadas seguem posições e proporções da imagem, sem unidade métrica.
- As letras **S/T** são preservadas literalmente; sua expansão não foi presumida.
- O equipamento de resíduos aparece como “Central de resíduos” na imagem e é a
  casa/área de resíduos solicitada. Não foram criados dois equipamentos.
- A academia é um equipamento estreito/vertical; a representação precisa manter
  seu rótulo legível sem mudar a posição relativa.
- Circulação cinza e contorno são primitivas geométricas validadas; não foram
  inventados nomes de ruas, sentidos, norte geográfico ou distâncias.
- Tabelas de período, serviço, equipe, semanas e justificativas pertencem à
  folha de planejamento e não viraram unidades do empreendimento.


## Preparar o cadastro da obra para uma conta autorizada

O exportador grava um JSON UTF-8 novo (recusa sobrescrever arquivo existente) e não conecta ao Firebase:

```powershell
node --experimental-strip-types scripts/exportar-lirios.mjs --arquivo .firebase/lirios-config.json
node --experimental-strip-types scripts/provisionar-obra.mjs --arquivo .firebase/lirios-config.json --uid UID_AUTORIZADO
```

O segundo comando apenas valida e lista os 3 documentos a criar, sem rede. O cadastro real exige projeto explícito e credencial administrativa temporária no provisionador existente, com --aplicar; só executar após conferir destino/UID. O lote exige documentos inexistentes e não sobrescreve Jardim ou dados de contas normais. Não há senha nesse plano. Cada UID recebe sua própria obra conforme o isolamento legado; não é uma migração de compartilhamento.
