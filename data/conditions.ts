export const Conditions: import('../sim/dex-conditions').ConditionDataTable = {
	dancer: {
		name: 'Dancer',
		noCopy: true,
		onStart(pokemon) {
			this.effectState.anyDanceThisTurn = false;
			this.effectState.canBoost = false;
			// 新增：首回合标记，确保换上来的那个回合不做判定
			this.effectState.isFirstTurn = true;
		},
		onAnyAfterMove(source: Pokemon, target: Pokemon, move: ActiveMove) {
			if (move.flags['dance']) {
				this.effectState.anyDanceThisTurn = true;
			}
		},
		onResidualOrder: 26,
		onResidual(pokemon: Pokemon) {
			// 1. 如果是刚换上来的那个回合，直接跳过逻辑，并将标记设为 false
			if (this.effectState.isFirstTurn) {
				this.effectState.isFirstTurn = false;
				this.effectState.anyDanceThisTurn = false; // 重置监控
				return;
			}

			// 2. 正常回合判定：如果这一回合没有任何人（包含自己）使用跳舞招式
			if (!this.effectState.anyDanceThisTurn) {
				if (!this.effectState.canBoost) {
					this.effectState.canBoost = true;
					// 发送 -start 指令让状态栏显示绿色的“舞者”标签
					this.add('-start', pokemon, 'dancer', '[silent]'); 
					this.add('-message', `${pokemon.name}渴望跳舞！`); 
				}
			} else {
				// 如果有人跳舞了，加速效果失效/无法激活
				if (this.effectState.canBoost) {
					this.effectState.canBoost = false;
					this.add('-end', pokemon, 'dancer', '[silent]');
				}
			}
			// 每回合结束重置监控标记
			this.effectState.anyDanceThisTurn = false;
		},
		onModifyPriority(priority: number, pokemon: Pokemon, target: Pokemon, move: ActiveMove) {
			// 只有在 canBoost 激活且使用的是跳舞招式时，提升 0.5 优先度
			if (move?.flags['dance'] && this.effectState.canBoost) {
				this.debug('Dancer priority boost (+0.5)');
				return priority + 0.5;
			}
		},
		onAfterMove(pokemon: Pokemon, target: Pokemon, move: ActiveMove) {
			// 成功使出跳舞招式后，消耗掉这个加速状态并移除 UI 标签
			if (move.flags['dance'] && this.effectState.canBoost) {
				this.effectState.canBoost = false;
				this.add('-end', pokemon, 'dancer', '[silent]');
			}
		},
	},
	shiyingli: {
		name: 'Shi Ying Li',
		noCopy: true, // 不会被接棒或复制类招式带走
		onStart(target) {
			this.add('-start', target, 'ability: Shi Ying Li');
			this.add('-message', `${target.name}吸收了阴影的力量！`);
		},
		// 修正攻击力 (物理)
		onModifyAtkPriority: 5,
		onModifyAtk(atk, attacker, defender, move) {
			if (move.type === 'Ghost' && attacker.hasAbility('shiyingli')) {
				this.debug('Shi Ying Li boost');
				return this.chainModify(1.5);
			}
		},
		// 修正特攻 (特殊)
		onModifySpAPriority: 5,
		onModifySpA(spa, attacker, defender, move) {
			if (move.type === 'Ghost' && attacker.hasAbility('shiyingli')) {
				this.debug('Shi Ying Li boost');
				return this.chainModify(1.5);
			}
		},
		onEnd(target) {
			this.add('-end', target, 'ability: Shi Ying Li', '[silent]');
		},
	},
	qianghuawuxiao: {
		name: 'Qiang Hua Wu Xiao',
		duration: 2,
		// 当状态开始时显示提示
		onStart(pokemon) {
			this.add('-start', pokemon, 'Qiang Hua Wu Xiao', '[silent]');
			this.add('-message', `${pokemon.name}的强化被暂时无视了！`);
		},
		// 当状态再次被施加时（刷新），重置回合数
		onRestart(pokemon) {
			this.effectState.duration = 2;
			this.add('-message', `${pokemon.name}的强化无效状态持续时间刷新了！`);
		},
		onEnd(pokemon) {
			this.add('-end', pokemon, 'Qiang Hua Wu Xiao', '[silent]');
			this.add('-message', `${pokemon.name}的强化重新生效了！`);
		},
		// --- 核心效果：无视正面能力变化 ---
		// 原理：如果能力等级大于0，则乘以修正系数将其抵消。
		// 公式：当前数值 * 2 / (2 + 等级) = 原始数值
		
		// 1. 无视攻击提升
		onModifyAtkPriority: 5,
		onModifyAtk(atk, pokemon) {
			if (pokemon.boosts.atk > 0) {
				return atk * 2 / (2 + pokemon.boosts.atk);
			}
		},
		// 2. 无视防御提升
		onModifyDefPriority: 5,
		onModifyDef(def, pokemon) {
			if (pokemon.boosts.def > 0) {
				return def * 2 / (2 + pokemon.boosts.def);
			}
		},
		// 3. 无视特攻提升
		onModifySpAPriority: 5,
		onModifySpA(spa, pokemon) {
			if (pokemon.boosts.spa > 0) {
				return spa * 2 / (2 + pokemon.boosts.spa);
			}
		},
		// 4. 无视特防提升
		onModifySpDPriority: 5,
		onModifySpD(spd, pokemon) {
			if (pokemon.boosts.spd > 0) {
				return spd * 2 / (2 + pokemon.boosts.spd);
			}
		},
		// 5. 无视速度提升
		onModifySpe(spe, pokemon) {
			if (pokemon.boosts.spe > 0) {
				return spe * 2 / (2 + pokemon.boosts.spe);
			}
		},
	},
	yuannengshifang: {
		name: 'yuannengshifang',
		duration: 2,
		onStart(pokemon) {
			this.add('-start', pokemon, 'Yuan Neng Shi Fang', '[silent]');
		},
		/**
		 * [关键补充] onRestart 事件
		 * 当一个已经拥有此状态的宝可梦再次被施加这个状态时（即连续使用源能释放时），
		 * onRestart 事件会被触发。我们在这里明确地将持续时间重置为2，
		 * 这确保了连锁不会中断。
		 */
		onRestart(pokemon) {
			this.effectState.duration = 2;
		},
		onEnd(pokemon) {
			this.add('-end', pokemon, 'Yuan Neng Shi Fang', '[silent]');
		},
	},
	woju: {
    name: 'Wo Ju', // 建议用英文或拼音ID，方便调试

		// 效果1：闪避率变化 (你的实现是正确的，我们保留它)
		onStart(target, source, effect) {
			this.add('-start', target, 'Wo Ju', '[from] ability: Wo Ju');
			this.add('-message', `${target.name} 躲进了它的壳里！`);
			
			// [!fix] 尝试降低闪避，并记录是否成功
			const success = this.boost({evasion: -1}, target, target, this.effect);
			if (success) {
				// 如果成功降低了闪避，就在状态里做一个标记
				this.effectState.boosted = true;
			}
		},
		onEnd(target) {
			// [!fix] 检查之前是否成功降低了闪避
			if (this.effectState.boosted) {
				// 如果做了标记，就手动把闪避恢复回来
				this.boost({evasion: 1}, target, target, this.effect);
				// 清除标记，为下一次做准备
				this.effectState.boosted = false; 
			}

			this.add('-end', target, 'Wo Ju');
			this.add('-message', `${target.name} 从壳里探出头来！`);
		},

		// 效果2：无视对手能力变化 (使用更标准的“纯朴”实现方式)
		// a) 当“蜗居”宝可梦攻击时，无视对手的防御和闪避能力提升
		onModifyMove(move, pokemon) {
			move.ignoreDefensive = true;
			move.ignoreEvasion = true;
		},
		// b) 当“蜗居”宝可梦被攻击时，无视对手的攻击和命中能力提升
		onTryHit(target, source, move) {
			move.ignoreOffensive = true;
		},

		// 效果3：不受天气和场地影响 (统一处理)
		// a) 统一处理所有伤害修正，包括天气和场地
		onDamage(damage, target, source, effect) {
			// effect.effectType === 'Move' 确保我们只处理招式伤害
			if (effect && effect.effectType === 'Move') {
				let finalMod = 1;
				const weather = this.field.getWeather();
				const terrain = this.field.getTerrain();

				// 逆转天气带来的威力变化
				 if (this.field.suppressingWeather()) {
					// 如果有无天气等特性，则不计算
				} else if (weather.id === 'sunnyday' || weather.id === 'desolateland') {
					if (effect.type === 'Fire') finalMod /= 1.5;
					if (effect.type === 'Water') finalMod /= 0.5;
				} else if (weather.id === 'raindance' || weather.id === 'primordialsea') {
					if (effect.type === 'Water') finalMod /= 1.5;
					if (effect.type === 'Fire') finalMod /= 0.5;
				}
				
				// 逆转场地带来的威力变化
				if (target.isGrounded()) {
					if (terrain.id === 'electricterrain' && effect.type === 'Electric') finalMod /= 1.3;
					if (terrain.id === 'grassyterrain' && effect.type === 'Grass') finalMod /= 1.3;
					if (terrain.id === 'psychicterrain' && effect.type === 'Psychic') finalMod /= 1.3;
					if (terrain.id === 'mistyterrain' && effect.type === 'Dragon') finalMod /= 0.5;
				}
				
				// 如果计算出了修正值，就应用它
				if (finalMod !== 1) {
					this.hint("蜗居在壳中挡住了环境对招式威力的影响!");
					return this.modify(damage, finalMod);
				}
			}
		},
	},
	seaoffire: {
		name: 'Sea of Fire',
		onFieldStart(field, source, effect) {
			this.add('-fieldstart', 'move: Sea of Fire');
		},
		onResidualOrder: 5,
		onResidualSubOrder: 1,
		onResidual(pokemon) {
			if (pokemon.hasType('Fire')) return;
			const foeSide = pokemon.side.foe;
			const hasActiveAbility = foeSide.active.some(p => 
				p && !p.fainted && p.hasAbility('huoshanxingzhe')
			);
			if (hasActiveAbility) {
				this.damage(pokemon.baseMaxhp / 8, pokemon);
			}
		},
		// 关键点：当全局伪天气真正消失时执行
		onFieldEnd() {
			this.add('-message', '随着火山行者的离去，火海平息了。');
			this.add('-fieldend', 'move: Sea of Fire');
		},
	},
	fantasysachetfling: {
		name: 'FantasySachetFling',
		duration: 1,
		onStart(target, source, sourceEffect) {
			const bannedAbilities = ['lingeringaroma', 'mummy'];
			const targetAbility = target.getAbility();

			if (bannedAbilities.includes(targetAbility.id) || (targetAbility as any).isPermanent) {
				return;
			}

			const oldAbility = target.setAbility('lingeringaroma');
			if (oldAbility) {
				target.baseAbility = 'lingeringaroma' as ID;

				if (sourceEffect && sourceEffect.effectType === 'Item') {
					if (source) {
						this.add('-ability', target, 'Lingering Aroma', '[from] item: Fantasy Sachet', '[of] ' + source.name);
					} else {
						this.add('-ability', target, 'Lingering Aroma', '[from] item: Fantasy Sachet');
					}
				} else {
					this.add('-ability', target, 'Lingering Aroma');
				}
			}
		},
	},
	fst: {
		name: 'fst',
		effectType: 'Status',
		onStart(target, source, sourceEffect) {
			// 确保冰系免疫冻伤
			if (target.hasType('Ice')) return false; 
			
			if (sourceEffect && sourceEffect.effectType === 'Ability') {
				this.add('-status', target, 'fst', '[from] ability: ' + sourceEffect.name, `[of] ${source}`);
			} else {
				this.add('-status', target, 'fst');
			}
			this.add('-message', `${target.name}被冻伤了！`); 
		},
		// 免疫逻辑：冰属性宝可梦免疫冻伤
		onSetStatus(status, target, source, effect) {
			if (status.id !== 'fst') return;
			if (target.hasType('Ice')) {
				this.debug('ice type immunity');
				return false;
			}
		},
		// 使用带有 defrost 标记的招式解除冻伤 ---
		onModifyMove(move, pokemon) {
			if (move.flags['defrost']) {
				this.add('-curestatus', pokemon, 'fst', `[from] move: ${move}`);
				pokemon.cureStatus();
			}
		},
		// 特攻减半逻辑：携带幻之生命宝珠时跳过
		onModifySpAPriority: 5,
		onModifySpA(spa, pokemon) {
			if (pokemon.hasItem('fantasylifeorb')) return; 
			return this.chainModify(0.5);
		},
		onResidualOrder: 10,
		onResidual(pokemon) {
			// [!关键补充]: 如果携带幻之生命宝珠，跳过冻伤本身的 1/16 扣血
			// 因为宝珠会在 items.ts 的 onResidual 中统一处理 1/10 的伤害
			if (pokemon.hasItem('fantasylifeorb')) return;
			this.damage(pokemon.baseMaxhp / 16);
		},
	},
	brn: {
		name: 'brn',
		effectType: 'Status',
		onStart(target, source, sourceEffect) {
			if (sourceEffect && sourceEffect.id === 'flameorb') {
				this.add('-status', target, 'brn', '[from] item: Flame Orb');
			} else if (sourceEffect && sourceEffect.effectType === 'Ability') {
				this.add('-status', target, 'brn', '[from] ability: ' + sourceEffect.name, `[of] ${source}`);
			} else {
				this.add('-status', target, 'brn');
			}
		},
		// Damage reduction is handled directly in the sim/battle.js damage function
		onResidualOrder: 10,
		onResidual(pokemon) {
			if (pokemon.hasItem('fantasylifeorb')) return;
			this.damage(pokemon.baseMaxhp / 16);
		},
	},
	par: {
		name: 'par',
		effectType: 'Status',
		onStart(target, source, sourceEffect) {
			if (sourceEffect && sourceEffect.effectType === 'Ability') {
				this.add('-status', target, 'par', '[from] ability: ' + sourceEffect.name, `[of] ${source}`);
			} else {
				this.add('-status', target, 'par');
			}
		},
		onModifySpePriority: -101,
		onModifySpe(spe, pokemon) {
			if (pokemon.hasItem('fantasylifeorb')) return spe;
			// Paralysis occurs after all other Speed modifiers, so evaluate all modifiers up to this point first
			spe = this.finalModify(spe);
			if (!pokemon.hasAbility('quickfeet')) {
				spe = Math.floor(spe * 50 / 100);
			}
			return spe;
		},
		onBeforeMovePriority: 1,
		onBeforeMove(pokemon) {
			if (pokemon.hasItem('fantasylifeorb')) return true;
			if (this.randomChance(1, 4)) {
				this.add('cant', pokemon, 'par');
				return false;
			}
		},
	},
	slp: {
		name: 'slp',
		effectType: 'Status',
		onStart(target, source, sourceEffect) {
			if (sourceEffect && sourceEffect.effectType === 'Ability') {
				this.add('-status', target, 'slp', '[from] ability: ' + sourceEffect.name, `[of] ${source}`);
			} else if (sourceEffect && sourceEffect.effectType === 'Move') {
				this.add('-status', target, 'slp', `[from] move: ${sourceEffect.name}`);
			} else {
				this.add('-status', target, 'slp');
			}
			// 1-3 turns
			this.effectState.startTime = this.random(2, 5);
			this.effectState.time = this.effectState.startTime;

			if (target.removeVolatile('nightmare')) {
				this.add('-end', target, 'Nightmare', '[silent]');
			}
		},
		onBeforeMovePriority: 10,
		onBeforeMove(pokemon, target, move) {
			if (pokemon.hasItem('fantasylifeorb')) return true;

			// --- [新增逻辑] 检查我方场上是否有“美梦共游”特性 ---
			if (pokemon.side.active.some(ally => ally && !ally.fainted && ally.hasAbility('meimenggongyou'))) {
				return true; // 如果有，则允许在睡眠中行动，跳过下面的限制
			}
			// ---------------------------------------------

			if (pokemon.hasAbility('earlybird')) {
				pokemon.statusState.time--;
			}
			pokemon.statusState.time--;
			if (pokemon.statusState.time <= 0) {
				pokemon.cureStatus();
				return;
			}
			this.add('cant', pokemon, 'slp');
			if (move.sleepUsable) {
				return;
			}
			return false;
		},
	},
	frz: {
		name: 'frz',
		effectType: 'Status',
		onStart(target, source, sourceEffect) {
			if (sourceEffect && sourceEffect.effectType === 'Ability') {
				this.add('-status', target, 'frz', '[from] ability: ' + sourceEffect.name, `[of] ${source}`);
			} else {
				this.add('-status', target, 'frz');
			}
			if (target.species.name === 'Shaymin-Sky' && target.baseSpecies.baseSpecies === 'Shaymin') {
				target.formeChange('Shaymin', this.effect, true);
				target.regressionForme = false;
			}
		},
		onBeforeMovePriority: 10,
		onBeforeMove(pokemon, target, move) {
			if (pokemon.hasItem('fantasylifeorb')) return true;
			if (move.flags['defrost']) return;
			if (this.randomChance(1, 5)) {
				pokemon.cureStatus();
				return;
			}
			this.add('cant', pokemon, 'frz');
			return false;
		},
		onModifyMove(move, pokemon) {
			if (move.flags['defrost']) {
				this.add('-curestatus', pokemon, 'frz', `[from] move: ${move}`);
				pokemon.clearStatus();
			}
		},
		onAfterMoveSecondary(target, source, move) {
			if (move.thawsTarget) {
				target.cureStatus();
			}
		},
		onDamagingHit(damage, target, source, move) {
			if (move.type === 'Fire' && move.category !== 'Status') {
				target.cureStatus();
			}
		},
	},
	psn: {
		name: 'psn',
		effectType: 'Status',
		onStart(target, source, sourceEffect) {
			if (sourceEffect && sourceEffect.effectType === 'Ability') {
				this.add('-status', target, 'psn', '[from] ability: ' + sourceEffect.name, `[of] ${source}`);
			} else {
				this.add('-status', target, 'psn');
			}
		},
		onResidualOrder: 9,
		onResidual(pokemon) {
			if (pokemon.hasItem('fantasylifeorb')) return;
			this.damage(pokemon.baseMaxhp / 8);
		},
	},
	tox: {
		name: 'tox',
		effectType: 'Status',
		onStart(target, source, sourceEffect) {
			this.effectState.stage = 0;
			if (sourceEffect && sourceEffect.id === 'toxicorb') {
				this.add('-status', target, 'tox', '[from] item: Toxic Orb');
			} else if (sourceEffect && sourceEffect.effectType === 'Ability') {
				this.add('-status', target, 'tox', '[from] ability: ' + sourceEffect.name, `[of] ${source}`);
			} else {
				this.add('-status', target, 'tox');
			}
		},
		onSwitchIn() {
			this.effectState.stage = 0;
		},
		onResidualOrder: 9,
		onResidual(pokemon) {
			if (pokemon.hasItem('fantasylifeorb')) return;
			if (this.effectState.stage < 15) {
				this.effectState.stage++;
			}
			this.damage(this.clampIntRange(pokemon.baseMaxhp / 16, 1) * this.effectState.stage);
		},
	},
	confusion: {
		name: 'confusion',
		// this is a volatile status
		onStart(target, source, sourceEffect) {
			if (sourceEffect?.id === 'lockedmove') {
				this.add('-start', target, 'confusion', '[fatigue]');
			} else if (sourceEffect?.effectType === 'Ability') {
				this.add('-start', target, 'confusion', '[from] ability: ' + sourceEffect.name, `[of] ${source}`);
			} else {
				this.add('-start', target, 'confusion');
			}
			const min = sourceEffect?.id === 'axekick' ? 3 : 2;
			this.effectState.time = this.random(min, 6);
		},
		onEnd(target) {
			this.add('-end', target, 'confusion');
		},
		onBeforeMovePriority: 3,
		onBeforeMove(pokemon) {
			pokemon.volatiles['confusion'].time--;
			if (!pokemon.volatiles['confusion'].time) {
				pokemon.removeVolatile('confusion');
				return;
			}
			this.add('-activate', pokemon, 'confusion');
			if (!this.randomChance(33, 100)) {
				return;
			}
			this.activeTarget = pokemon;
			const damage = this.actions.getConfusionDamage(pokemon, 40);
			if (typeof damage !== 'number') throw new Error("Confusion damage not dealt");
			const activeMove = { id: this.toID('confused'), effectType: 'Move', type: '???' };
			this.damage(damage, pokemon, pokemon, activeMove as ActiveMove);
			return false;
		},
	},
	flinch: {
		name: 'flinch',
		duration: 1,
		onBeforeMovePriority: 8,
		onBeforeMove(pokemon) {
			this.add('cant', pokemon, 'flinch');
			this.runEvent('Flinch', pokemon);
			return false;
		},
	},
	trapped: {
		name: 'trapped',
		noCopy: true,
		onTrapPokemon(pokemon) {
			pokemon.tryTrap();
		},
		onStart(target) {
			this.add('-activate', target, 'trapped');
		},
	},
	trapper: {
		name: 'trapper',
		noCopy: true,
	},
	partiallytrapped: {
		name: 'partiallytrapped',
		duration: 5,
		durationCallback(target, source) {
			if (source?.hasItem('gripclaw')) return 8;
			return this.random(5, 7);
		},
		onStart(pokemon, source) {
			this.add('-activate', pokemon, 'move: ' + this.effectState.sourceEffect, `[of] ${source}`);
			this.effectState.boundDivisor = source.hasItem('bindingband') ? 6 : 8;
		},
		onResidualOrder: 13,
		onResidual(pokemon) {
			const source = this.effectState.source;
			// G-Max Centiferno and G-Max Sandblast continue even after the user leaves the field
			const gmaxEffect = ['gmaxcentiferno', 'gmaxsandblast'].includes(this.effectState.sourceEffect.id);
			if (source && (!source.isActive || source.hp <= 0 || !source.activeTurns) && !gmaxEffect) {
				delete pokemon.volatiles['partiallytrapped'];
				this.add('-end', pokemon, this.effectState.sourceEffect, '[partiallytrapped]', '[silent]');
				return;
			}
			this.damage(pokemon.baseMaxhp / this.effectState.boundDivisor);
		},
		onEnd(pokemon) {
			this.add('-end', pokemon, this.effectState.sourceEffect, '[partiallytrapped]');
		},
		onTrapPokemon(pokemon) {
			const gmaxEffect = ['gmaxcentiferno', 'gmaxsandblast'].includes(this.effectState.sourceEffect.id);
			if (this.effectState.source?.isActive || gmaxEffect) pokemon.tryTrap();
		},
	},
	lockedmove: {
		// Outrage, Thrash, Petal Dance...
		name: 'lockedmove',
		duration: 2,
		onResidual(target) {
			if (target.status === 'slp') {
				// don't lock, and bypass confusion for calming
				delete target.volatiles['lockedmove'];
			}
			this.effectState.trueDuration--;
		},
		onStart(target, source, effect) {
			this.effectState.trueDuration = this.random(2, 4);
			this.effectState.move = effect.id;
		},
		onRestart() {
			if (this.effectState.trueDuration >= 2) {
				this.effectState.duration = 2;
			}
		},
		onEnd(target) {
			if (this.effectState.trueDuration > 1) return;
			target.addVolatile('confusion');
		},
		onLockMove(pokemon) {
			if (pokemon.volatiles['dynamax']) return;
			return this.effectState.move;
		},
	},
	twoturnmove: {
		// Skull Bash, SolarBeam, Sky Drop...
		name: 'twoturnmove',
		duration: 2,
		onStart(attacker, defender, effect) {
			// ("attacker" is the Pokemon using the two turn move and the Pokemon this condition is being applied to)
			this.effectState.move = effect.id;
			attacker.addVolatile(effect.id);
			// lastMoveTargetLoc is the location of the originally targeted slot before any redirection
			// note that this is not updated for moves called by other moves
			// i.e. if Dig is called by Metronome, lastMoveTargetLoc will still be the user's location
			let moveTargetLoc: number = attacker.lastMoveTargetLoc!;
			if (effect.sourceEffect && this.dex.moves.get(effect.id).target !== 'self') {
				// this move was called by another move such as Metronome
				// and needs a random target to be determined this turn
				// it will already have one by now if there is any valid target
				// but if there isn't one we need to choose a random slot now
				if (defender.fainted) {
					defender = this.sample(attacker.foes(true));
				}
				moveTargetLoc = attacker.getLocOf(defender);
			}
			attacker.volatiles[effect.id].targetLoc = moveTargetLoc;
			this.attrLastMove('[still]');
			// Run side-effects normally associated with hitting (e.g., Protean, Libero)
			this.runEvent('PrepareHit', attacker, defender, effect);
		},
		onEnd(target) {
			target.removeVolatile(this.effectState.move);
		},
		onLockMove() {
			return this.effectState.move;
		},
		onMoveAborted(pokemon) {
			pokemon.removeVolatile('twoturnmove');
		},
	},
	choicelock: {
		name: 'choicelock',
		noCopy: true,
		onStart(pokemon) {
			if (!this.activeMove) throw new Error("Battle.activeMove is null");
			if (!this.activeMove.id || this.activeMove.hasBounced || this.activeMove.sourceEffect === 'snatch') return false;
			this.effectState.move = this.activeMove.id;
		},
		onBeforeMove(pokemon, target, move) {
			if (!pokemon.getItem().isChoice) {
				pokemon.removeVolatile('choicelock');
				return;
			}
			if (
				!pokemon.ignoringItem() && !pokemon.volatiles['dynamax'] &&
				move.id !== this.effectState.move && move.id !== 'struggle'
			) {
				// Fails unless the Choice item is being ignored, and no PP is lost
				this.addMove('move', pokemon, move.name);
				this.attrLastMove('[still]');
				this.debug("Disabled by Choice item lock");
				this.add('-fail', pokemon);
				return false;
			}
		},
		onDisableMove(pokemon) {
			if (!pokemon.getItem().isChoice || !pokemon.hasMove(this.effectState.move)) {
				pokemon.removeVolatile('choicelock');
				return;
			}
			if (pokemon.ignoringItem() || pokemon.volatiles['dynamax']) {
				return;
			}
			for (const moveSlot of pokemon.moveSlots) {
				if (moveSlot.id !== this.effectState.move) {
					pokemon.disableMove(moveSlot.id, false, this.effectState.sourceEffect);
				}
			}
		},
	},
	mustrecharge: {
		name: 'mustrecharge',
		duration: 2,
		onBeforeMovePriority: 11,
		onBeforeMove(pokemon) {
			this.add('cant', pokemon, 'recharge');
			pokemon.removeVolatile('mustrecharge');
			pokemon.removeVolatile('truant');
			return null;
		},
		onStart(pokemon) {
			this.add('-mustrecharge', pokemon);
		},
		onLockMove: 'recharge',
	},
	futuremove: {
		// this is a slot condition
		name: 'futuremove',
		onStart(target) {
			this.effectState.targetSlot = target.getSlot();
			this.effectState.endingTurn = (this.turn - 1) + 2;
			if (this.effectState.endingTurn >= 254) {
				this.hint(`In Gen 8+, Future attacks will never resolve when used on the 255th turn or later.`);
			}
		},
		onResidualOrder: 3,
		onResidual(target: Pokemon) {
			if (this.getOverflowedTurnCount() < this.effectState.endingTurn) return;
			target.side.removeSlotCondition(this.getAtSlot(this.effectState.targetSlot), 'futuremove');
		},
		onEnd(target) {
			const data = this.effectState;
			// time's up; time to hit! :D
			const move = this.dex.moves.get(data.move);
			if (target.fainted || target === data.source) {
				this.hint(`${move.name} did not hit because the target is ${(target.fainted ? 'fainted' : 'the user')}.`);
				return;
			}

			this.add('-end', target, 'move: ' + move.name);
			target.removeVolatile('Protect');
			target.removeVolatile('Endure');

			if (data.source.hasAbility('infiltrator') && this.gen >= 6) {
				data.moveData.infiltrates = true;
			}
			if (data.source.hasAbility('normalize') && this.gen >= 6) {
				data.moveData.type = 'Normal';
			}
			const hitMove = new this.dex.Move(data.moveData) as ActiveMove;

			this.actions.trySpreadMoveHit([target], data.source, hitMove, true);
			if (data.source.isActive && data.source.hasItem('lifeorb') && this.gen >= 5) {
				this.singleEvent('AfterMoveSecondarySelf', data.source.getItem(), data.source.itemState, data.source, target, data.source.getItem());
			}
			this.activeMove = null;

			this.checkWin();
		},
	},
	healreplacement: {
		// this is a slot condition
		name: 'healreplacement',
		onStart(target, source, sourceEffect) {
			this.effectState.sourceEffect = sourceEffect;
			this.add('-activate', source, 'healreplacement');
		},
		onSwitchIn(target) {
			if (!target.fainted) {
				target.heal(target.maxhp);
				this.add('-heal', target, target.getHealth, '[from] move: ' + this.effectState.sourceEffect, '[zeffect]');
				target.side.removeSlotCondition(target, 'healreplacement');
			}
		},
	},
	stall: {
		// Protect, Detect, Endure counter
		name: 'stall',
		duration: 2,
		counterMax: 729,
		onStart() {
			this.effectState.counter = 3;
		},
		onStallMove(pokemon) {
			// this.effectState.counter should never be undefined here.
			// However, just in case, use 1 if it is undefined.
			const counter = this.effectState.counter || 1;
			this.debug(`Success chance: ${Math.round(100 / counter)}%`);
			const success = this.randomChance(1, counter);
			if (!success) delete pokemon.volatiles['stall'];
			return success;
		},
		onRestart() {
			if (this.effectState.counter < (this.effect as Condition).counterMax!) {
				this.effectState.counter *= 3;
			}
			this.effectState.duration = 2;
		},
	},
	gem: {
		name: 'gem',
		duration: 1,
		affectsFainted: true,
		onBasePowerPriority: 14,
		onBasePower(basePower, user, target, move) {
			this.debug('Gem Boost');
			return this.chainModify([5325, 4096]);
		},
	},

	// weather is implemented here since it's so important to the game

	raindance: {
		name: 'RainDance',
		effectType: 'Weather',
		duration: 5,
		durationCallback(source, effect) {
			if (source?.hasItem('damprock')) {
				return 8;
			}
			return 5;
		},
		onWeatherModifyDamage(damage, attacker, defender, move) {
			if (defender.hasItem('utilityumbrella')) return;
			if (move.type === 'Water') {
				this.debug('rain water boost');
				return this.chainModify(1.5);
			}
			if (move.type === 'Fire') {
				this.debug('rain fire suppress');
				return this.chainModify(0.5);
			}
		},
		onFieldStart(field, source, effect) {
			if (effect?.effectType === 'Ability') {
				if (this.gen <= 5) this.effectState.duration = 0;
				this.add('-weather', 'RainDance', '[from] ability: ' + effect.name, `[of] ${source}`);
			} else {
				this.add('-weather', 'RainDance');
			}
		},
		onFieldResidualOrder: 1,
		onFieldResidual() {
			this.add('-weather', 'RainDance', '[upkeep]');
			this.eachEvent('Weather');
		},
		onFieldEnd() {
			this.add('-weather', 'none');
		},
	},
	primordialsea: {
		name: 'PrimordialSea',
		effectType: 'Weather',
		duration: 0,
		onTryMovePriority: 1,
		onTryMove(attacker, defender, move) {
			if (move.type === 'Fire' && move.category !== 'Status') {
				this.debug('Primordial Sea fire suppress');
				this.add('-fail', attacker, move, '[from] Primordial Sea');
				this.attrLastMove('[still]');
				return null;
			}
		},
		onWeatherModifyDamage(damage, attacker, defender, move) {
			if (defender.hasItem('utilityumbrella')) return;
			if (move.type === 'Water') {
				this.debug('Rain water boost');
				return this.chainModify(1.5);
			}
		},
		onFieldStart(field, source, effect) {
			this.add('-weather', 'PrimordialSea', '[from] ability: ' + effect.name, `[of] ${source}`);
		},
		onFieldResidualOrder: 1,
		onFieldResidual() {
			this.add('-weather', 'PrimordialSea', '[upkeep]');
			this.eachEvent('Weather');
		},
		onFieldEnd() {
			this.add('-weather', 'none');
		},
	},
	sunnyday: {
		name: 'SunnyDay',
		effectType: 'Weather',
		duration: 5,
		durationCallback(source, effect) {
			if (source?.hasItem('heatrock')) {
				return 8;
			}
			return 5;
		},
		onWeatherModifyDamage(damage, attacker, defender, move) {
			if (move.id === 'hydrosteam' && !attacker.hasItem('utilityumbrella')) {
				this.debug('Sunny Day Hydro Steam boost');
				return this.chainModify(1.5);
			}
			if (defender.hasItem('utilityumbrella')) return;
			if (move.type === 'Fire') {
				this.debug('Sunny Day fire boost');
				return this.chainModify(1.5);
			}
			if (move.type === 'Water') {
				this.debug('Sunny Day water suppress');
				return this.chainModify(0.5);
			}
		},
		onFieldStart(battle, source, effect) {
			if (effect?.effectType === 'Ability') {
				if (this.gen <= 5) this.effectState.duration = 0;
				this.add('-weather', 'SunnyDay', '[from] ability: ' + effect.name, `[of] ${source}`);
			} else {
				this.add('-weather', 'SunnyDay');
			}
		},
		onImmunity(type, pokemon) {
			if (pokemon.hasItem('utilityumbrella')) return;
			if (type === 'frz') return false;
		},
		onFieldResidualOrder: 1,
		onFieldResidual() {
			this.add('-weather', 'SunnyDay', '[upkeep]');
			this.eachEvent('Weather');
		},
		onFieldEnd() {
			this.add('-weather', 'none');
		},
	},
	desolateland: {
		name: 'DesolateLand',
		effectType: 'Weather',
		duration: 0,
		onTryMovePriority: 1,
		onTryMove(attacker, defender, move) {
			if (move.type === 'Water' && move.category !== 'Status') {
				this.debug('Desolate Land water suppress');
				this.add('-fail', attacker, move, '[from] Desolate Land');
				this.attrLastMove('[still]');
				return null;
			}
		},
		onWeatherModifyDamage(damage, attacker, defender, move) {
			if (defender.hasItem('utilityumbrella')) return;
			if (move.type === 'Fire') {
				this.debug('Sunny Day fire boost');
				return this.chainModify(1.5);
			}
		},
		onFieldStart(field, source, effect) {
			this.add('-weather', 'DesolateLand', '[from] ability: ' + effect.name, `[of] ${source}`);
		},
		onImmunity(type, pokemon) {
			if (pokemon.hasItem('utilityumbrella')) return;
			if (type === 'frz') return false;
		},
		onFieldResidualOrder: 1,
		onFieldResidual() {
			this.add('-weather', 'DesolateLand', '[upkeep]');
			this.eachEvent('Weather');
		},
		onFieldEnd() {
			this.add('-weather', 'none');
		},
	},
	sandstorm: {
		name: 'Sandstorm',
		effectType: 'Weather',
		duration: 5,
		durationCallback(source, effect) {
			if (source?.hasItem('smoothrock')) {
				return 8;
			}
			return 5;
		},
		// This should be applied directly to the stat before any of the other modifiers are chained
		// So we give it increased priority.
		onModifySpDPriority: 10,
		onModifySpD(spd, pokemon) {
			if (pokemon.hasType('Rock') && this.field.isWeather('sandstorm')) {
				return this.modify(spd, 1.5);
			}
		},
		onFieldStart(field, source, effect) {
			if (effect?.effectType === 'Ability') {
				if (this.gen <= 5) this.effectState.duration = 0;
				this.add('-weather', 'Sandstorm', '[from] ability: ' + effect.name, `[of] ${source}`);
			} else {
				this.add('-weather', 'Sandstorm');
			}
		},
		onFieldResidualOrder: 1,
		onFieldResidual() {
			this.add('-weather', 'Sandstorm', '[upkeep]');
			if (this.field.isWeather('sandstorm')) this.eachEvent('Weather');
		},
		onWeather(target) {
			this.damage(target.baseMaxhp / 16);
		},
		onFieldEnd() {
			this.add('-weather', 'none');
		},
	},
	hail: {
		name: 'Hail',
		effectType: 'Weather',
		duration: 5,
		durationCallback(source, effect) {
			if (source?.hasItem('icyrock')) {
				return 8;
			}
			return 5;
		},
		onFieldStart(field, source, effect) {
			if (effect?.effectType === 'Ability') {
				if (this.gen <= 5) this.effectState.duration = 0;
				this.add('-weather', 'Hail', '[from] ability: ' + effect.name, `[of] ${source}`);
			} else {
				this.add('-weather', 'Hail');
			}
		},
		onFieldResidualOrder: 1,
		onFieldResidual() {
			this.add('-weather', 'Hail', '[upkeep]');
			if (this.field.isWeather('hail')) this.eachEvent('Weather');
		},
		onWeather(target) {
			this.damage(target.baseMaxhp / 16);
		},
		onFieldEnd() {
			this.add('-weather', 'none');
		},
	},
	snowscape: {
		name: 'Snowscape',
		effectType: 'Weather',
		duration: 5,
		durationCallback(source, effect) {
			if (source?.hasItem('icyrock')) {
				return 8;
			}
			return 5;
		},
		onModifyDefPriority: 10,
		onModifyDef(def, pokemon) {
			if (pokemon.hasType('Ice') && this.field.isWeather('snowscape')) {
				return this.modify(def, 1.5);
			}
		},
		onFieldStart(field, source, effect) {
			if (effect?.effectType === 'Ability') {
				if (this.gen <= 5) this.effectState.duration = 0;
				this.add('-weather', 'Snowscape', '[from] ability: ' + effect.name, `[of] ${source}`);
			} else {
				this.add('-weather', 'Snowscape');
			}
		},
		onFieldResidualOrder: 1,
		onFieldResidual() {
			this.add('-weather', 'Snowscape', '[upkeep]');
			if (this.field.isWeather('snowscape')) this.eachEvent('Weather');
		},
		onFieldEnd() {
			this.add('-weather', 'none');
		},
	},
	deltastream: {
		name: 'DeltaStream',
		effectType: 'Weather',
		duration: 0,
		onEffectivenessPriority: -1,
		onEffectiveness(typeMod, target, type, move) {
			if (move && move.effectType === 'Move' && move.category !== 'Status' && type === 'Flying' && typeMod > 0) {
				this.add('-fieldactivate', 'Delta Stream');
				return 0;
			}
		},
		onFieldStart(field, source, effect) {
			this.add('-weather', 'DeltaStream', '[from] ability: ' + effect.name, `[of] ${source}`);
		},
		onFieldResidualOrder: 1,
		onFieldResidual() {
			this.add('-weather', 'DeltaStream', '[upkeep]');
			this.eachEvent('Weather');
		},
		onFieldEnd() {
			this.add('-weather', 'none');
		},
	},

	dynamax: {
		name: 'Dynamax',
		noCopy: true,
		onStart(pokemon) {
			this.effectState.turns = 0;
			pokemon.removeVolatile('minimize');
			pokemon.removeVolatile('substitute');
			if (pokemon.volatiles['torment']) {
				delete pokemon.volatiles['torment'];
				this.add('-end', pokemon, 'Torment', '[silent]');
			}
			if (['cramorantgulping', 'cramorantgorging'].includes(pokemon.species.id) && !pokemon.transformed) {
				pokemon.formeChange('cramorant');
			}
			this.add('-start', pokemon, 'Dynamax', pokemon.gigantamax ? 'Gmax' : '');
			if (pokemon.baseSpecies.name === 'Shedinja') return;

			// Changes based on dynamax level, 2 is max (at LVL 10)
			const ratio = 1.5 + (pokemon.dynamaxLevel * 0.05);

			pokemon.maxhp = Math.floor(pokemon.maxhp * ratio);
			pokemon.hp = Math.floor(pokemon.hp * ratio);
			this.add('-heal', pokemon, pokemon.getHealth, '[silent]');
		},
		onTryAddVolatile(status, pokemon) {
			if (status.id === 'flinch') return null;
		},
		onBeforeSwitchOutPriority: -1,
		onBeforeSwitchOut(pokemon) {
			pokemon.removeVolatile('dynamax');
		},
		onSourceModifyDamage(damage, source, target, move) {
			if (move.id === 'behemothbash' || move.id === 'behemothblade' || move.id === 'dynamaxcannon') {
				return this.chainModify(2);
			}
		},
		onDragOutPriority: 2,
		onDragOut(pokemon) {
			this.add('-block', pokemon, 'Dynamax');
			return null;
		},
		onResidualPriority: -100,
		onResidual() {
			this.effectState.turns++;
		},
		onEnd(pokemon) {
			this.add('-end', pokemon, 'Dynamax');
			if (pokemon.baseSpecies.name === 'Shedinja') return;
			pokemon.hp = pokemon.getUndynamaxedHP();
			pokemon.maxhp = pokemon.baseMaxhp;
			this.add('-heal', pokemon, pokemon.getHealth, '[silent]');
		},
	},

	// Commander needs two conditions so they are implemented here
	// Dondozo
	commanded: {
		name: "Commanded",
		noCopy: true,
		onStart(pokemon) {
			this.boost({ atk: 2, spa: 2, spe: 2, def: 2, spd: 2 }, pokemon);
		},
		onDragOutPriority: 2,
		onDragOut() {
			return false;
		},
		// Prevents Shed Shell allowing a swap
		onTrapPokemonPriority: -11,
		onTrapPokemon(pokemon) {
			pokemon.trapped = true;
		},
	},
	// Tatsugiri
	commanding: {
		name: "Commanding",
		noCopy: true,
		onDragOutPriority: 2,
		onDragOut() {
			return false;
		},
		// Prevents Shed Shell allowing a swap
		onTrapPokemonPriority: -11,
		onTrapPokemon(pokemon) {
			pokemon.trapped = true;
		},
		// Dodging moves is handled in BattleActions#hitStepInvulnerabilityEvent
		// This is here for moves that manually call this event like Perish Song
		onInvulnerability: false,
		onBeforeTurn(pokemon) {
			this.queue.cancelAction(pokemon);
		},
	},

	// Arceus and Silvally's actual typing is implemented here.
	// Their true typing for all their formes is Normal, and it's only
	// Multitype and RKS System, respectively, that changes their type,
	// but their formes are specified to be their corresponding type
	// in the Pokedex, so that needs to be overridden.
	// This is mainly relevant for Hackmons Cup and Balanced Hackmons.
	arceus: {
		name: 'Arceus',
		onTypePriority: 1,
		onType(types, pokemon) {
			if (pokemon.transformed || pokemon.ability !== 'multitype' && this.gen >= 8) return types;
			let type: string | undefined = 'Normal';
			if (pokemon.ability === 'multitype') {
				type = pokemon.getItem().onPlate;
				if (!type) {
					type = 'Normal';
				}
			}
			return [type];
		},
	},
	silvally: {
		name: 'Silvally',
		onTypePriority: 1,
		onType(types, pokemon) {
			if (pokemon.transformed || pokemon.ability !== 'rkssystem' && this.gen >= 8) return types;
			let type: string | undefined = 'Normal';
			if (pokemon.ability === 'rkssystem') {
				type = pokemon.getItem().onMemory;
				if (!type) {
					type = 'Normal';
				}
			}
			return [type];
		},
	},
	rolloutstorage: {
		name: 'rolloutstorage',
		duration: 2,
		onBasePower(relayVar, source, target, move) {
			let bp = Math.max(1, move.basePower);
			bp *= 2 ** source.volatiles['rolloutstorage'].contactHitCount;
			if (source.volatiles['defensecurl']) {
				bp *= 2;
			}
			source.removeVolatile('rolloutstorage');
			return bp;
		},
	},
};
