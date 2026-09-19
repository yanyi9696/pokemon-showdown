# 肉鸽成长数据来源

PokéAPI 提供物种成长组、基础经验产出、捕获率及 1～100 级经验表。经验／捕捉快照写入 `sim/fantasy-rogue-data.ts`，努力值产出写入 `sim/fantasy-rogue-evs.ts`；运行时不联网。

来源：https://github.com/PokeAPI/pokeapi/tree/5c776e225f2150862e021062d7f304c8958368cc/data/v2/csv

原文件：`pokemon_species.csv`、`pokemon.csv`、`experience.csv`、`pokemon_stats.csv`。采集日期：2026-09-19。字段说明：https://pokeapi.co/docs/v2 。数据是该快照当前物种值，公式采用第七世代基线；不声称逐项复刻某一原版 ROM 的全部数据。

SHA-256：

```text
species.csv: e66e2eeb25fd3836b0ebab6bf87bbf01960aa3c0555e2bac495fa8393c5e0c45
pokemon.csv: 16c81c33188b0eac403aa2f759fcbe9e42c611f722d263f5b5a6a5bff9f8ce6b
experience.csv: 246d5d215bb90ee47206b57bfb9d9f639f73080ee8e99147382814e44e4f417b
pokemon_stats.csv: fa2c44263a3706468682fefc3e0b3c4f5487fe9febed7d4ebcd6939c34b16aa8
```

参考机制：

- 捕捉的原始机制研究：https://www.dragonflycave.com/mechanics/gen-vi-vii-capturing/
- PokéRogue 作者的捕捉实现参考：https://github.com/pagefaultgames/pokerogue/blob/main/src/phases/attempt-capture-phase.ts
- 经验分享及等级差：https://marriland.com/glossary/experience-points/

使用独立编写的规则代码，没有复制 PokéRogue 源码。已有 PS 精灵图和道具图标继续使用；缺少的糖果、联系绳和恢复道具使用 PokéRogue 图集，固定来源及声明见客户端 `play.pokemonshowdown.com/sprites/fantasy-rogue/README.md`。

努力值取 `pokemon_stats.csv` 的 `effort` 字段，按 HP、攻击、防御、特攻、特防、速度存储。只读取离线数据；本次未改变原经验和捕捉公式。

## PokéAPI 数据许可

Copyright (c) © 2013–2023 Paul Hallett and PokéAPI contributors (https://github.com/PokeAPI/pokeapi#contributing). Pokémon and Pokémon character names are trademarks of Nintendo.

All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

* Neither the name of PokéAPI nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
