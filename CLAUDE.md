# Overlay pessoal de iRacing — fork do irDashies + recursos do Kapps

## Contexto

App de overlays para iRacing de uso pessoal (Fernando, Windows, Logitech G29 + pedais SimJack).
Base: fork do **irDashies** (https://github.com/tariknz/irdashies), licença MIT.
Objetivo: manter tudo o que o irDashies já faz e somar os recursos que o Kapps oferece e o irDashies não tem.

## Regras

- Manter o arquivo LICENSE e o aviso de copyright do irDashies (exigência da licença MIT).
- Não usar código, imagens nem layouts do Kapps. Ele serve só de referência de funcionalidade.
- Frontend (`src/frontend/`) não importa nada de `src/app/`; a comunicação é por IPC, com tipos em `src/types/` (regra do projeto original).
- Toda feature nova precisa ter story no Storybook e configuração na tela de Settings.

## Setup (Windows)

1. Node.js 20+ com build tools (necessárias para o addon nativo do SDK do iRacing).
2. `git clone` do fork → `npm install` → `npm start` (o app abre na bandeja).
3. `npm run storybook` para desenvolver widgets sem o iRacing aberto.
4. `npm run make` gera o instalador `.exe`.

## O que já vem do irDashies (não reimplementar)

Input trace, Tachometer (LEDs por carro), Standings, Relative, Track Map, Flat Track Map, Weather,
Faster Cars From Behind, Fuel Calculator (overlay), Blind Spot Monitor, Slow Car Ahead, Garage Cover,
Rejoin Indicator, Pitlane Helper, Lap Timer, Flags, Setup Comparison, Twitch Chat, Telemetry Inspector,
perfis, servidor web para OBS (`localhost:3000/dashboard`), temas, atalhos de teclado e always on top.

## Backlog — o que adicionar (por prioridade)

### Concluído — Interface em português (PT-BR)

- i18n nas Settings e nos rótulos dos widgets, com inglês como fallback.
- Pronto quando: as Settings estiverem todas em PT-BR e o idioma puder ser trocado sem reiniciar.
- Status: implementado no branch `traducao-ptbr` e mesclado no `main`; falta a validação no iRacing real (Test Drive).

### 1. Coach de Frenagem (recriação do coach do Dex Overlay)

- Antes: "(Futuro) Coach de frenagem do Dex Overlay — Avaliar portar o coach de frenagem como widget. Discutir antes de começar." Decisão tomada: recriar como widget.
- Referência de comportamento: `C:\Users\Fernando\Downloads\dex-overlay-v1.22.0\dex-overlay` (`coach.py`, `web/coach.html`, `coach_notes/`).
- Reimplementar em TypeScript como widget do irDashies (telemetria pelo SDK já existente, interface em React), com todos os textos em PT-BR via i18n.
- Fora do escopo: a parte de aulas.
- Story no Storybook e configurações na tela de Settings, como toda feature nova.
- Pronto quando: funcionar numa sessão real com o mesmo comportamento do original.

### 2. Modo desempenho

- Taxa de atualização configurável por widget, com padrão baixo para Standings, Relative e mapa da pista.
- Pausar o processamento e a renderização de widgets ocultos.
- Mostrar o consumo de CPU e memória do app nas configurações.
- Pronto quando: o uso de CPU com o perfil "Corrida" cair de forma mensurável em relação ao padrão (medir antes e depois na mesma sessão ou replay).

### 3. Atalhos nos botões do volante (equivalente ao `gamepad.node` do Kapps)

- Ler botões de controladores DirectInput/XInput (G29) no processo principal.
- Ações mapeáveis: mostrar/ocultar overlays, modo de edição, próximo perfil, reset do histórico de combustível, ligar/desligar widget específico.
- Tela de bindings com "aperte o botão" para capturar, convivendo com os atalhos de teclado já existentes.
- Pronto quando: um botão do G29 alternar a visibilidade dos overlays com o iRacing em foco.

### 4. Análise de frenagem

- Por curva: pico de pressão no freio, tempo até o pico, formato da soltura (trail braking) e travamentos de roda.
- Ao fim da volta: comparação com a melhor volta, mostrando em quais curvas freou cedo ou tarde.
- Pronto quando: exibir os dados de cada curva de uma volta real.

### 5. Volta de referência

- Importar a volta de referência de outro piloto (o professor).
- Mostrar o delta ao vivo contra ela, com opção de alternar entre a melhor volta pessoal e a referência.
- Pronto quando: o delta bater com a diferença real no fim da volta.

### 6. Notas por pista

- Usar os `coach_notes` do Dex Overlay como anotações por curva no Track Map e no widget de nomes de curva (Corner Names).
- Exibir a nota ao se aproximar da curva.
- Notas editáveis nas configurações.
- Pronto quando: as notas aparecerem na curva certa numa sessão real.

### 7. Calculadora de combustível de planejamento (janela própria, como o "Fuel Calc" do Kapps)

- Janela independente, que funciona fora da sessão: duração da corrida (tempo ou voltas), tempo de volta, consumo por volta, tamanho do tanque e margem.
- Saída: combustível total, número de paradas, combustível por stint e volta ideal de parada.
- Botão "puxar da sessão atual" para preencher consumo e tempo de volta pela telemetria.
- Pronto quando: os resultados baterem com um cálculo manual em 3 cenários (corrida curta, corrida por tempo e endurance com 2+ paradas).

### 8. Resumo pós-sessão

- Ao fim de cada sessão, salvar: voltas, consistência (desvio padrão dos tempos), incidentes, consumo de combustível e variação de iRating.
- Tela de histórico por pista e carro.
- Pronto quando: três sessões aparecerem no histórico com os dados corretos.

### 9. Alertas de voz em PT-BR

- Alertas: carro ao lado, combustível baixo (voltas restantes), janela de pit aberta e bandeiras.
- Cada alerta com liga/desliga e volume próprios.
- Pronto quando: os alertas tocarem numa sessão real sem atraso perceptível.

### 10. Perfis prontos

- "Corrida", "Treino/Quali" e "Stream", cada um com um conjunto de widgets e posições.
- Pronto quando: os três perfis vierem pré-instalados e puderem ser alternados pelo atalho do volante.

### 11. Tema Dex Racing

- Tema de cores laranja, preto e dourado como opção nas configurações de aparência.
- Pronto quando: o tema for aplicado em todos os widgets.

### 12. Voltas importadas por pista e carro

- Guardar as voltas importadas (Garage 61 e `.ibt`) por pista e carro, em vez de um único espaço global para cada tipo: importar uma volta nova não substitui as de outras combinações de pista e carro.
- Ao entrar numa sessão, o coach e o Lap Trace usam a volta importada da pista e do carro atuais; sem ela, uma de outro carro da mesma categoria na mesma pista, como já acontece hoje.
- Migrar as voltas que já estão nos espaços globais para a pista e o carro de origem delas.
- Lista nas configurações com as voltas salvas (pista, carro, origem, piloto ou arquivo, tempo de volta e data), com opção de apagar cada uma.
- Pronto quando: duas voltas importadas de combinações diferentes continuarem salvas lado a lado, cada sessão usar a da sua pista e carro, e apagar uma pela lista a remover sem afetar as outras.

### 13. Integração com o Garage 61 (API oficial)

- Autenticação por Personal Access Token do Garage 61. O token fica salvo só localmente, nas configurações do app; nunca vai para o repositório, logs ou exports de dashboard.
- Ao entrar numa sessão, identificar pista e carro e buscar a volta de referência no Garage 61.
- Regra de prioridade configurável entre: volta do professor (via time no Garage 61), recorde da pista ou minha melhor volta.
- Baixar a telemetria em CSV, converter para o formato de referência do coach e manter cache local, para funcionar offline.
- Substitui a importação manual de referências; a importação de `.ibt` continua disponível como alternativa.
- Pronto quando (sugestão, a confirmar com o Fernando): numa sessão real, a referência do Garage 61 for baixada e usada pelo coach sem nenhuma importação manual, respeitando a prioridade escolhida, e continuar disponível offline a partir do cache.

### 14. Linha da volta de referência no Track Map

- Desenhar no Track Map (e no Flat Track Map, se fizer sentido) a linha percorrida pela volta de referência: minha melhor volta, `.ibt` importado ou Garage 61.
- Posição a partir de latitude/longitude: o CSV do Garage 61 já traz `Lat`/`Lon` e a telemetria do iRacing também; a gravação da minha melhor volta passa a guardar esses dois canais.
- Projetar as coordenadas no mesmo sistema do desenho da pista e alinhar com o traçado do mapa.
- Opções: liga/desliga, cor, espessura e opacidade da linha; opcionalmente destacar os pontos de freio e de retomada do acelerador.
- Pronto quando: a linha aparecer sobre a pista certa numa sessão real, alinhada ao traçado do mapa, para uma volta gravada e para uma importada do Garage 61.

### 15. (Opcional) Monitor de stream

- Painel simples com status da sessão, FPS e qualidade de rede do iRacing, para quem transmite.
- Escopo a definir com o Fernando antes de implementar.

## Fluxo de trabalho

- Um branch por item do backlog e um commit por etapa funcional.
- Push e pull requests só no fork `fesouzza87/irdashies`. **Nunca** abrir pull request (nem issue ou comentário) no repositório original `tariknz/irdashies`; ao usar `gh`, passar sempre `--repo fesouzza87/irdashies`.
- Rodar `npm run lint` e `npm run test` antes de cada commit.
- Testar no iRacing real (sessão Test Drive) antes de marcar o item como pronto.
