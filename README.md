# Loteria Assistente

Aplicativo pessoal e responsivo, hospedável no GitHub Pages, com autenticação e registros no Supabase.

## Etapa atual: registros pessoais e resultados da semana

- Login por e-mail e senha do usuário já criado no Supabase.
- Seleção manual e geração aleatória de combinações para Mega-Sena, Mega da Virada, Lotofácil, Quina, Lotomania e Dupla Sena.
- Probabilidades combinatórias do prêmio principal (Dupla Sena: por sorteio).
- Favoritos, edição de nome e observações, prevenção de duplicidade no cadastro de favoritos.
- Registro manual de apostas por concurso, custo e prêmio informado. Aposta duplicada no mesmo concurso exige confirmação.
- Orçamento mensal, temas claro/escuro e exportação JSON.
- Sincronização ao entrar, retornar ao app e após alterações. Sem edição offline nesta etapa.

O painel consulta os resultados diretamente no domínio da Caixa, com estimativa, acumulado, dezenas e rateio por faixa. A Dupla Sena separa os dois sorteios. A Mega da Virada usa a identificação especial da Caixa; sua reserva acumulada é rotulada como reserva, sem assumir que seja estimativa do prêmio final.

Conferência do histórico completo, restauração de backup e sugestões baseadas em cobertura ainda não foram integradas. Nenhum resultado fictício é usado no app. Os arquivos em `tests/fixtures` são respostas reais fixadas somente para testes; não abastecem o painel.

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

O histórico completo dos sorteios será integrado em etapa própria, separado do painel semanal.

Frequências e resultados anteriores não tornam uma combinação específica mais provável em sorteios independentes.

## Dependências

Supabase JavaScript 2.119.0, distribuído localmente em `vendor/supabase.js`, licença MIT. Fontes DM Sans e Manrope carregadas do Google Fonts, com fontes alternativas locais quando indisponíveis.
