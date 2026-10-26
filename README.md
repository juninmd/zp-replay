# zp-replay PoC

Prova de conceito: abrir um demo GoldSrc (`.dem`) no navegador e desenhar a
trajetória do jogador que gravou. O parse roda no cliente via WebAssembly, então o
arquivo não sai da máquina.

## O que a PoC faz

- Parse de `.dem` com [`hldemo`](https://github.com/YaLTeR/hldemo-rs) compilado para `wasm32`.
- Extrai a posição (`origin`) do gravador a partir dos frames `ClientData`.
- Viewer em canvas 2D com trajetória e slider de tempo.

## O que a PoC NÃO faz (limite do `hldemo`)

- **Posição de outros jogadores e bots não é extraída.** Elas estão nas mensagens
  `svc_packetentities`, delta-comprimidas, que o `hldemo` deixa como bytes brutos
  (`NetMsgData.msg`). Para o replay de partida inteira, é preciso escrever o decoder
  de entidades ou usar o plugin AMXX que grava posições (plano B).
- Não há mapeamento para overview do mapa; a escala é só a bounding box da trajetória.

## Mudanças no `hldemo` (vendorizado)

`vendor/hldemo` é uma cópia da versão 0.3.0 (MIT/Apache-2.0, licenças incluídas).
A única alteração é remover o `;` final de duas arms da macro em `src/parse/macros.rs`
(linhas 31 e 34): o rustc atual trata isso como erro. Sem o patch, o crate não compila.

## Verificação

```
cd crate && cargo build --release --target wasm32-unknown-unknown
cd .. && bun test                 # 2 pass: rejeita lixo; 288 amostras do basic.dem
bun scripts/serve.ts              # http://localhost:8080
```

Os valores de referência do teste vêm do exemplo nativo (`examples/origins.rs`,
rodado sobre o mesmo `basic.dem`). A checagem no navegador (upload de `basic.dem`)
mostrou `t=0.00s x=484 y=318 (1/288)`; captura em `poc-screenshot.png`.

O `basic.dem` é um fixture de teste do próprio `hldemo` (upstream), não dado de
projeto. Não o use em publicações.

## Viewer 3D do mapa (`web/map.html`)

Além da PoC em canvas 2D (`web/index.html`), há um viewer Three.js que carrega um mapa BSP
e os trajetos de um replay. Os dados são locais e ficam fora do git:

```
bun install
bun run build:web                              # gera web/map-app.js (gitignored)
bun scripts/extract-replay.ts <demo.dem> local-replays/<nome>.json
cp <de_dust2.bsp> local-maps/                  # asset do jogo, não versionado
bun scripts/serve.ts                           # http://localhost:8080/map.html?replay=<nome>.json
```

Observação: `parse.test.ts` depende do `.wasm` (`bun run build:wasm`); sem ele esse teste falha.

## Próximos passos (se a direção for adiante)

1. Decoder de `svc_packetentities` para ter posições de todos os jogadores e bots.
2. Overview do mapa para escala real.
3. Sanitização antes de publicar: nomes, steam_id e chat saem do replay; a senha de RCON nunca entra.
