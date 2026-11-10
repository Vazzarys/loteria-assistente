# Loteria Assistente

Aplicativo pessoal e responsivo, hospedável no GitHub Pages, com autenticação e registros no Supabase.

## Etapa atual: registros pessoais, painel semanal, conferência, sugestões e estatísticas

- Login por e-mail e senha do usuário já criado no Supabase.
- Seleção manual e geração aleatória de combinações para Mega-Sena, Mega da Virada, Lotofácil, Quina, Lotomania e Dupla Sena.
- Probabilidades combinatórias do prêmio principal (Dupla Sena: por sorteio).
- Favoritos, edição de nome e observações, prevenção de duplicidade no cadastro de favoritos.
- Registro manual de apostas por concurso, custo e prêmio informado. Aposta duplicada no mesmo concurso exige confirmação.
- Orçamento mensal, temas claro/escuro e exportação JSON.
- Sincronização ao entrar, retornar ao app e após alterações. Sem edição offline nesta etapa.

O painel consulta os resultados diretamente no domínio da Caixa, com estimativa, acumulado, dezenas e rateio por faixa. A Dupla Sena separa os dois sorteios. A Mega da Virada usa a identificação especial da Caixa. A estimativa especial em destaque usa o anúncio oficial de 03/11/2026 em `special-announcements.js`, com link e data da publicação, e não a reserva acumulada da API. Esse anúncio é uma referência verificada, não uma consulta automática a notícias; alterações exigem revisão do arquivo. A estimativa da API ganha prioridade somente quando identifica o mesmo concurso especial. A referência expira após o sorteio ou quando o resultado desse concurso já consta na fonte. A reserva é apresentada separadamente, com sua própria data de consulta.

A conferência histórica está disponível em Montar jogo e Favoritos. Mostra contagens exatas de 0 até o total de dezenas sorteadas, concursos correspondentes, datas, dezenas coincidentes e consulta à fonte. A Dupla Sena compara cada sorteio individualmente; a Lotomania inclui zero coincidências. Jogos ampliados usam contenção das dezenas sorteadas, sem chamar esse resultado de combinação idêntica. As listas exibem 40 registros por vez, ordenados por coincidências e número do concurso.

O módulo Sugestões prioriza o prêmio principal e usa cobertura combinatória exata do lote, conforme descrito abaixo. Restauração de backup e conferência financeira de uma aposta no concurso escolhido ainda não foram integradas. Nenhum resultado fictício é usado no app. Os arquivos em `tests/fixtures` são respostas reais fixadas somente para testes; não abastecem o painel.

## Sugestões: objetivo e limites matemáticos

O botão Estatísticas e frequências em Sugestões (também disponível em Montar jogo) abre o ranking completo por modalidade. Usa o histórico inteiro por padrão e permite recortes dos últimos 50, 100 ou 500 concursos, ordenação por mais/menos frequentes ou número, as dez duplas mais observadas e a distribuição de pares/ímpares. Na Mega da Virada, o filtro inicial usa somente as edições especiais identificadas; é possível trocar para toda a Mega-Sena. Na Dupla Sena, os sorteios podem ser analisados juntos ou separados. O número 00 da Lotomania é par.

Os percentuais usam como denominador os sorteios analisados, não a quantidade total de bolas nem a de concursos quando houver dois sorteios. A referência uniforme por dezena é `d/N`, e por dupla é `d(d-1)/(N(N-1))`. Os períodos recentes seguem o número do concurso. São análises descritivas, sem teste de viés ou significância e sem alterar os critérios de geração. Uma diferença na frequência observada não é apresentada como previsão. Recortes sem dados e bases parciais/desatualizadas são indicados.

O módulo usa apostas simples de menor quantidade de dezenas para dar flexibilidade à distribuição do lote. O usuário informa orçamento, preço por aposta e concurso futuro. Os preços padrão foram conferidos nas páginas oficiais da Caixa em 10/11/2026; são editáveis e não são atualizados automaticamente pela API de resultados. O cálculo de custo usa o preço informado. O orçamento é calculado em centavos inteiros e limitado pelo saldo mensal dos registros, se houver orçamento mensal configurado. Sugestões não são apostas feitas nem reservas de saldo.

Nas modalidades em que a aposta simples contém exatamente o total de dezenas sorteadas, cada combinação distinta cobre um resultado principal. Assim, para `m` jogos distintos entre `N` dezenas com `d` sorteadas, a chance do lote é `m / C(N,d)`. Essa chance não melhora pela frequência passada e é igual à de qualquer outro lote com o mesmo número de combinações distintas. Apostas ampliadas de preço proporcional não criam uma vantagem por real; equivalem a várias combinações simples. O gerador evita combinações já integralmente cobertas por apostas registradas no mesmo concurso.

Como segundo objetivo, o gerador busca maior cobertura de resultados que dariam pelo menos `d-1` acertos em algum jogo do lote. Para cada aposta simples, enumera a própria combinação e todas as trocas de uma dezena por uma externa. A união desses conjuntos conta cada resultado uma única vez. Na Mega-Sena, por exemplo, são 325 resultados possíveis por aposta para pelo menos cinco acertos (incluindo os seis). Quando a união atinge a soma dos tamanhos individuais, o lote alcançou o teto matemático dessa cobertura. Caso contrário, a interface informa que não há garantia de ótimo global.

Na Lotomania, cada jogo de 50 dezenas cobre `C(50,20)` resultados principais, e jogos distintos podem ter sobreposição. A união é calculada exatamente por inclusão-exclusão sobre as interseções dos jogos, sem somar chances sobrepostas. Há limite de oito jogos por geração para manter esse cálculo exato e responsivo. O segundo jogo inclui uma opção espelho entre os candidatos. O par complementar atinge a cobertura máxima de 20 acertos para dois jogos. Para lotes maiores, a busca não garante ótimo global. A chance conjunta de 19 acertos não é calculada nessa modalidade.

A busca é sequencial: considera 32 candidatos aleatórios por novo jogo, seleciona o maior ganho de cobertura e desempata pela menor repetição de dezenas no lote. Usa o gerador criptográfico do navegador com amostragem sem viés. Há limite de 20 jogos por geração nas outras modalidades, explicitado antes de gerar. Os limites podem deixar parte do orçamento sem uso. Na Dupla Sena, as probabilidades exibidas são por sorteio.

Depois de fixar o lote, o módulo faz uma comparação exploratória nos últimos 20% da base por número de concurso, contra 32 lotes aleatórios de mesmo tamanho e custo, com as mesmas exclusões. O histórico não é usado para escolher candidatos nem ajustar parâmetros. O comparativo não é apresentado como prova de previsão ou vantagem futura, nem como validação prospectiva. Frequências da base completa são somente descritivas. Os acertos históricos não são convertidos em dinheiro ou lucro.

O usuário pode salvar sugestões como favoritos, conferir cada jogo no histórico ou exportar a análise completa, incluindo os inteiros da contagem combinatória, parâmetros e fonte. Alterar os parâmetros invalida a análise anterior. A geração pode ser cancelada e não grava apostas reais.

Os testes incluem enumeração exaustiva em universos pequenos para verificar união de resultados e inclusão-exclusão, probabilidades de referência, orçamento e duplicidades, apostas ampliadas, cancelamento e regressões do histórico. Essas verificações não constituem garantia de ausência de defeitos nem de premiação.

## Publicação

Em Settings → Pages, configure Deploy from a branch → main → / (root). O aplicativo é estático e não exige build.

`config.js` contém somente a URL, a chave publicável e o UID autorizado. A proteção dos registros depende das políticas RLS do Supabase, não do código público. Nunca adicionar senha do banco, chave secret ou service_role.

As tabelas `favorites`, `bets` e `settings` e a política `owner_only` foram criadas na etapa de configuração do Supabase. O login não cadastra usuários e não efetua apostas na Caixa.

## Conferências locais

Node.js 22 ou superior:

```sh
npm run check
npm test
python -m http.server 8080
```

Abra http://localhost:8080. Os testes não acessam nem alteram registros reais. Login e gravação reais devem ser validados pelo proprietário após a publicação.

## Atualização e painel semanal

O painel exibe somente a semana de segunda a domingo em America/Sao_Paulo, inclusive no detalhe de rateio. A consulta é realizada ao abrir a conta, ao voltar ao app após cinco minutos, a cada cinco minutos enquanto aberto e visível, e pelo botão Atualizar resultados. Não há agendamento no GitHub, nem gravação desses dados no Supabase.

As respostas são validadas por modalidade, dezenas e estrutura de rateio. O app segue os concursos anteriores até sair da semana; se a consulta falhar ou o encadeamento estiver incompleto, sinaliza consulta parcial. A ausência de ganhador só é afirmada após uma consulta semanal completa.

Uma cópia pública local permite exibição com aviso de consulta anterior se a fonte estiver indisponível. Na troca da semana, os rateios anteriores são filtrados da interface e da lista semanal do cache; favoritos e apostas não são afetados. Metadados da última resposta podem ser retidos para informar a próxima estimativa, sempre com data da consulta. A integração depende de um endpoint público do Portal Loterias Caixa, sujeito a indisponibilidade ou mudança de formato.

## Fonte e atualização do histórico

`data/history/*.json` foi extraído dos arquivos XLSX baixados no endpoint oficial de download do portal. Os cinco arquivos contêm 20.098 concursos: Mega-Sena 3.083, Lotofácil 3.825, Quina 7.163, Lotomania 2.997 e Dupla Sena 3.030, esta com dois sorteios por concurso. A origem exata, o instante de importação e o SHA-256 do XLSX estão registrados em cada JSON. Não são importados rateios antigos nesta base, somente números, datas e identificação dos concursos especiais.

O script de extração, somente com a biblioteca padrão do Python, é reproduzível:

```sh
python scripts/import_history.py --source-dir /tmp/loteria-fontes
```

O portal publica seu host atual em `https://loterias.caixa.gov.br/Style%20Library/json/params.txt`. Na importação, o host de download era `servicebus3.caixa.gov.br`. Os resultados individuais continuam disponíveis na API usada pelo painel semanal.

O arquivo de cada modalidade é carregado sob demanda. Ao conferir, o navegador consulta o último concurso e obtém os registros faltantes, com até três consultas simultâneas. O histórico público fica em IndexedDB, com alternativa em memória se o navegador bloquear o cache. Favoritos e apostas continuam no Supabase. Não é necessário administrar outro banco de dados.

Antes de calcular, o app valida modalidade, IDs duplicados, datas e dezenas. A cobertura de concursos é contada de 1 até o último concurso confirmado. Se a atualização falhar ou houver lacunas, exibe o limite da base e não afirma que a combinação nunca saiu em todo o histórico atual. É possível cancelar a consulta fechando a janela.

Datas de dois pontos da fonte oficial estão fora da sequência dos concursos (Quina 379/380 e Dupla Sena 827/828). A consulta individual da Caixa retornou as mesmas datas do XLSX. Elas foram preservadas; os registros são identificados na interface. A ordenação usa o número do concurso.

Os concursos antigos da Mega da Virada não têm identificação uniforme na API: 2009–2016 retornam marcador 1, enquanto os recentes retornam 2. A relação das edições 2009–2025 foi cruzada com https://asloterias.com.br/todos-resultados-mega-da-virada ; datas e dezenas permanecem as do download oficial (incluindo o concurso 2955 realizado em 01/01/2026). O concurso 3100 foi identificado no comunicado oficial de 2026. Ao selecionar Mega da Virada, o usuário escolhe entre toda a Mega-Sena e somente as edições especiais identificadas.

Frequências e resultados anteriores não tornam uma combinação específica mais provável em sorteios independentes.

## Dependências

Supabase JavaScript 2.119.0, distribuído localmente em `vendor/supabase.js`, licença MIT. Fontes DM Sans e Manrope carregadas do Google Fonts, com fontes alternativas locais quando indisponíveis.
