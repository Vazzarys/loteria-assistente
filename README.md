# Loteria Assistente

Aplicativo pessoal e responsivo, hospedável no GitHub Pages, com autenticação e registros no Supabase.

## Etapa atual: registros pessoais, painel semanal e conferência histórica

- Login por e-mail e senha do usuário já criado no Supabase.
- Seleção manual e geração aleatória de combinações para Mega-Sena, Mega da Virada, Lotofácil, Quina, Lotomania e Dupla Sena.
- Probabilidades combinatórias do prêmio principal (Dupla Sena: por sorteio).
- Favoritos, edição de nome e observações, prevenção de duplicidade no cadastro de favoritos.
- Registro manual de apostas por concurso, custo e prêmio informado. Aposta duplicada no mesmo concurso exige confirmação.
- Orçamento mensal, temas claro/escuro e exportação JSON.
- Sincronização ao entrar, retornar ao app e após alterações. Sem edição offline nesta etapa.

O painel consulta os resultados diretamente no domínio da Caixa, com estimativa, acumulado, dezenas e rateio por faixa. A Dupla Sena separa os dois sorteios. A Mega da Virada usa a identificação especial da Caixa. A estimativa especial em destaque usa o anúncio oficial de 03/11/2026 em `special-announcements.js`, com link e data da publicação, e não a reserva acumulada da API. Esse anúncio é uma referência verificada, não uma consulta automática a notícias; alterações exigem revisão do arquivo. A estimativa da API ganha prioridade somente quando identifica o mesmo concurso especial. A referência expira após o sorteio ou quando o resultado desse concurso já consta na fonte. A reserva é apresentada separadamente, com sua própria data de consulta.

A conferência histórica está disponível em Montar jogo e Favoritos. Mostra contagens exatas de 0 até o total de dezenas sorteadas, concursos correspondentes, datas, dezenas coincidentes e consulta à fonte. A Dupla Sena compara cada sorteio individualmente; a Lotomania inclui zero coincidências. Jogos ampliados usam contenção das dezenas sorteadas, sem chamar esse resultado de combinação idêntica. As listas exibem 40 registros por vez, ordenados por coincidências e número do concurso.

Restauração de backup, conferência financeira de uma aposta no concurso escolhido e sugestões baseadas em cobertura ainda não foram integradas. Nenhum resultado fictício é usado no app. Os arquivos em `tests/fixtures` são respostas reais fixadas somente para testes; não abastecem o painel.

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
