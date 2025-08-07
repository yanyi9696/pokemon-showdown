export const Items: import('../../../sim/dex-items').ModdedItemDataTable = {
	toxtricityz: {
		name: "Toxtricity Z",
		spritenum: 686,
		onTakeItem: false, // Z纯晶不能被移除
		zMove: "Chaopinyaogunpoyinbo",
		zMoveFrom: "Overdrive",
		itemUser: ["Toxtricity-Fantasy", "Toxtricity-Low-Key-Fantasy"], // 再次确认形态名称
		num: 10000,
		gen: 9,
		desc: "颤弦蝾螈Z。颤弦蝾螈携带后,可以把破音转化成特殊的Ｚ招式: 超频摇滚破音波。",
		shortDesc: "颤弦蝾螈Z。颤弦蝾螈携带后,可以把破音转化成特殊的Ｚ招式: 超频摇滚破音波。",
	},
	fantasypowerlens: {
		name: "Fantasy Power Lens",
		spritenum: 359,
		fling: {
			basePower: 100,
    },
    // 效果1：禁用暴击。
    onModifyMove(move) {
        move.willCrit = false;
    },
    // 效果2：提升命中率。
    onSourceModifyAccuracy(accuracy, source, target, move) {
        // 首先，检查是不是变化类招式。如果是，则道具不生效。
        if (move.category === 'Status') return;

        // 然后，再检查招式命中率的类型
        if (typeof move.accuracy !== 'number') return;

        // 在这里进行完整的条件判断
        const isHustleAffected = source.hasAbility('hustle') && move.category === 'Physical';
        if (move.accuracy < 100 || (move.accuracy === 100 && isHustleAffected)) {
            this.debug('Fantasy Power Lens boosting accuracy');
            return this.chainModify([4915, 4096]); // 1.2倍
        }
    },
    // 效果3：提升威力。
    onBasePower(basePower, source, target, move) {
        // 变化类招式没有威力，直接返回。
        if (move.category === 'Status') return;
        
        // 检查招式的原始命中率是否为数字。
        if (typeof move.accuracy !== 'number') return;

        // 在这里重复一次完整的条件判断
        const isHustleAffected = source.hasAbility('hustle') && move.category === 'Physical';
        if (move.accuracy < 100 || (move.accuracy === 100 && isHustleAffected)) {
            this.debug('Fantasy Power Lens boosting power');
            return this.chainModify([4915, 4096]); // 1.2倍
        }
    },
		num: 10001,
		gen: 9,
		desc: "幻之力量镜。携带后,虽然攻击将无法击中要害,但命中不满100%的非变化类技能命中率与威力会提升1.2倍。",
		shortDesc: "幻之力量镜。攻击无法击中要害,命中不满100%的非变化技能威力与命中率提升1.2倍。",
	},
	fantasyringtarget: {
		name: "Fantasy Ring Target",
		spritenum: 410,
		fling: { basePower: 30 },
		onStart(pokemon) {
        // 新增：在宝可梦登场时显示提示信息，暴露道具
        this.add('-message', `${pokemon.name}的幻之标靶正在锁定目标!`);
		this.add('-item', pokemon, 'Fantasy Ring Target');
		},
		onDisableMove(pokemon) {
			for (const moveSlot of pokemon.moveSlots) {
				const move = this.dex.moves.get(moveSlot.id);
				if (move.category === 'Status') {
					// 禁用这个招式
					pokemon.disableMove(moveSlot.id);
				}
			}
		},
		onModifyMove(move, pokemon) {
			if (move.category !== 'Status') {
				move.ignoreImmunity = true;
			}
		},
		num: 10002,
		gen: 9,
		desc: "幻之标靶。携带后,登场会暴露道具,虽然无法使用变化招式,但使用的原本属性相性没有效果的招式会变为有效果。",
		shortDesc: "幻之标靶。登场时暴露道具,使用的招式无视属性免疫,但无法使用变化招式。",
	},
	fantasylifeorb: {
		name: "Fantasy Life Orb",
		spritenum: 249, // 暂用 Life Orb 图标
		fling: {
			basePower: 30,
		},
		onSourceModifyDamage(damage, source, target, move) {
			// 检查道具持有者(target)是否存在主要异常状态
			if (target.status) {
            this.debug('幻之生命宝珠:因异常状态,获得伤害减免1/4。');
            // 使用 chainModify 来应用乘算修饰。4096 * 0.75 = 3072
            return this.chainModify(3072 / 4096);
			}
		},
		onResidual(pokemon) {
			if (pokemon.status && ['brn', 'par', 'slp', 'frz', 'psn', 'tox'].includes(pokemon.status)) {
				this.damage(pokemon.baseMaxhp / 10, pokemon, pokemon, this.dex.items.get('fantasylifeorb'));
			}
		},
		//不受异常状态效果影响的效果分别写在各个异常状态里了
		num: 10003,
		gen: 9,
		desc: "幻之生命宝珠。携带后, 不受异常状态效果影响,处于异常状态下的宝可梦,受到的伤害降低1/4,但回合结束时将损失最大HP的1/10。",
		shortDesc: "幻之生命宝珠。异常状态效果无效,异常状态下伤害减免1/4,每回合损血1/10。",
	},
	fantasysachet: {
		name: "Fantasy Sachet",
		spritenum: 691,
		fling: {
			basePower: 10,
			volatileStatus: 'fantasysachetfling',
		} as any,
		onTryBoost(boost: {[key: string]: number}, target: Pokemon, source: Pokemon | null, effect: Effect | null) {
			let hasBoost = false;
			// 遍历所有即将发生的能力变化
			for (const i in boost) {
				// 只要有任何一项能力是提升的 (值 > 0)
				if (boost[i] > 0) {
					hasBoost = true;
					// 就从即将发生的变化中，把这一项删除
					delete boost[i];
				}
			}
			// 只要确实有能力提升被阻止了，就显示消息
			if (hasBoost) {
				this.add('-fail', target, 'unboost', '[from] item: Fantasy Sachet');
			}
		},
		// 方案A：处理【主动攻击】。当持有者使用接触招式时，动态给招式附加 onHit 效果
		onModifyMove(move, pokemon) {
			if (!move.flags['contact'] || !pokemon.hasItem('fantasysachet')) return;
			
			// 动态为这个招式添加 onHit 事件
			move.onHit = (target, source) => {
				// 确保 source 和 target 存在且不是队友
				if (!source || !target || target.isAlly(source) || target === source) return;

				const affected = target;
				const bannedAbilities = ['lingeringaroma', 'mummy'];
				const affectedAbilityId = affected.ability;
				const affectedAbility = this.dex.abilities.get(affectedAbilityId);

				if (affectedAbility && !bannedAbilities.includes(affectedAbilityId) && !(affectedAbility as any).isPermanent) {
					// 'this' 在这里指向 Battle 对象，是正确的
					if (source.useItem()) {
						affected.baseAbility = 'lingeringaroma' as ID;
						affected.setAbility('lingeringaroma');
						this.add('-activate', source, 'item: Fantasy Sachet');
						this.add('-ability', affected, 'Lingering Aroma', '[from] item: Fantasy Sachet');
					}
				}
			};
		},

		// 方案B：处理【被动防御】。当持有者被接触招式命中时触发
		onDamagingHit(damage, target, source, move) {
			if (!move.flags['contact'] || !target.hasItem('fantasysachet')) return;
			if (!source || source.isAlly(target) || source === target) return;

			const affected = source;
			const bannedAbilities = ['lingeringaroma', 'mummy'];
			const affectedAbilityId = affected.ability;
			const affectedAbility = this.dex.abilities.get(affectedAbilityId);

			if (affectedAbility && !bannedAbilities.includes(affectedAbilityId) && !(affectedAbility as any).isPermanent) {
				if (target.useItem()) {
					affected.baseAbility = 'lingeringaroma' as ID;
					affected.setAbility('lingeringaroma');
					this.add('-activate', target, 'item: Fantasy Sachet');
					this.add('-ability', affected, 'Lingering Aroma', '[from] item: Fantasy Sachet');
				}
			}
		},
		num: 10004,
		gen: 9,
		desc: "幻之香袋。携带道具后将无法提升能力,当接触对方或被对方接触时,将对方的特性更改为甩不掉的气味,生效一次后消失。",
		shortDesc: "幻之香袋。无法提升能力,当双方接触时,将对手的特性变为甩不掉的气味。",
	},
};
