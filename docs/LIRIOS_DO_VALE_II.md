# Lírios do Vale II — geometria de desenvolvimento

Referência principal: [planejamento anexado](referencias/lirios-do-vale-ii.png).
O mapa é SVG funcional definido em dados, sem usar a imagem como fundo.
Não representa levantamento topográfico, medidas ou orientação geográfica certificada.

## Identidade e acesso

- Nova obra: `lirios-do-vale-ii`, nome **Lírios do Vale II**.
- Template: `lirios-v1`; planta: `implantacao-lirios`.
- Jardim das Tulipas I conserva `obra-principal` e seus dados.
- As sete contas de teste provisionadas recebem ambas as obras por atribuição administrativa.
- O cenário negativo `obra-teste-b` permanece disponível só a Gestor e DEV pelo escopo real.
- Este provisionamento é exclusivo de Auth/Firestore Emulator, projeto `demo-coloredplans`.

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

## Verificação

Testes de geometria conferem contagem, ordem dos números, áreas e limites.
Testes de navegador confirmam seleção, gravação, recarga, contexto,
aplicabilidade em Kit e isolamento entre as duas obras. A suíte integrada
validou 47 testes de domínio, 52 de Rules e 31 de interface, além de
TypeScript, lint e build. A execução cobre Chromium; não substitui
validação humana com outros navegadores e leitores de tela. As Rules existentes
continuam sendo a autoridade; nenhuma exceção por e-mail é criada.
