# Loteria Assistente

Aplicativo pessoal e responsivo, hospedável no GitHub Pages, com autenticação e registros no Supabase.

## Etapa atual: registros pessoais

- Login por e-mail e senha do usuário já criado no Supabase.
- Seleção manual e geração aleatória de combinações para Mega-Sena, Mega da Virada, Lotofácil, Quina, Lotomania e Dupla Sena.
- Probabilidades combinatórias do prêmio principal (Dupla Sena: por sorteio).
- Favoritos, edição de nome e observações, prevenção de duplicidade no cadastro de favoritos.
- Registro manual de apostas por concurso, custo e prêmio informado. Aposta duplicada no mesmo concurso exige confirmação.
- Orçamento mensal, temas claro/escuro e exportação JSON.
- Sincronização ao entrar, retornar ao app e após alterações. Sem edição offline nesta etapa.

Resultados, premiações, conferência histórica, restauração de backup e sugestões baseadas em cobertura ainda não foram integrados. A interface identifica essa limitação. Nenhum resultado fictício é usado.

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

## Histórico e painel semanal planejados

O histórico completo dos sorteios servirá à comparação de combinações. O painel de premiações exibirá somente a semana de segunda a domingo no fuso America/Sao_Paulo. A troca da semana não apagará favoritos nem apostas.

Frequências e resultados anteriores não tornam uma combinação específica mais provável em sorteios independentes.

## Dependências

Supabase JavaScript 2.119.0, distribuído localmente em `vendor/supabase.js`, licença MIT. Fontes DM Sans e Manrope carregadas do Google Fonts, com fontes alternativas locais quando indisponíveis.
