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
    // 在宝可梦每次行动前，清除上一次可能留下的标记，保证安全
    onBeforeMove(pokemon) {
        if (pokemon.m?.fantasypowerlens_boost) {
            delete pokemon.m.fantasypowerlens_boost;
        }
    },
    // 此函数现在是核心，负责所有判断和设置标记
    onModifyMove(move, source) {
        move.willCrit = false; // 禁用暴击

        // 对于不适用或必中的技能，直接返回
        if (move.category === 'Status' || move.accuracy === true) return;
        
        // 预判Hustle是否会生效
        const isHustleAffected = source.hasAbility('hustle') && move.category === 'Physical';
        
        // 核心判断：
        // 1. 技能原始命中 < 100
        // 2. 或，技能原始命中是100，但会被Hustle影响
        if (move.accuracy < 100 || (move.accuracy === 100 && isHustleAffected)) {
            // 确认需要增益，设置标记，后续函数会读取这个标记
            if (!source.m) source.m = {};
            source.m.fantasypowerlens_boost = true;
            this.debug('Fantasy Power Lens: Flag set for boost.');

            // 同时，处理UI显示问题
            move.accuracy *= 1.2;
            this.debug('Fantasy Power Lens: UI accuracy updated.');
        }
    },
    // 这个函数现在只根据标记执行，不再进行判断
    onSourceModifyAccuracy(accuracy, source, target, move) {
        if (source.m?.fantasypowerlens_boost) {
            this.debug('Fantasy Power Lens: Applying accuracy boost.');
            return this.chainModify([4915, 4096]); // 1.2倍
        }
    },
    // 这个函数也只根据标记执行
    onSourceModifyDamage(damage, source, target, move) {
        if (source.m?.fantasypowerlens_boost) {
            this.debug('Fantasy Power Lens: Applying damage boost.');
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
			for (const moveSlot of pokemon.moveSlots) {
				const move = this.dex.moves.get(moveSlot.id);
				if (move.category === 'Status') {
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
		desc: "幻之标靶。在携带该道具后,虽然无法使用变化招式,但使用的原本属性相性没有效果的招式会变为有效果。",
		shortDesc: "幻之标靶。在携带该道具后,使用的招式无视属性免疫,但无法使用变化招式。",
	},
	fantasylifeorb: {
		name: "Fantasy Life Orb",
		spritenum: 249, // 暂用 Life Orb 图标
		fling: {
			basePower: 30,
		},
		onResidual(pokemon) {
			if (pokemon.status && ['brn', 'par', 'slp', 'frz', 'psn', 'tox'].includes(pokemon.status)) {
				this.damage(pokemon.baseMaxhp / 10, pokemon, pokemon, this.dex.items.get('fantasylifeorb'));
			}
		},
		//不受异常状态效果影响的效果分别写在各个异常状态里了
		num: 10003,
		gen: 9,
		desc: "幻之生命宝珠。携带后,不受异常状态效果影响,但处于异常状态下的宝可梦,回合结束时将损失最大HP的1/10。",
		shortDesc: "幻之生命宝珠。异常状态效果无效,但异常状态下每回合损失1/10最大HP。",
	},
	fantasysachet: {
		name: "Fantasy Sachet",
		spritenum: 691, // 用Sachet的图标
		fling: {
			basePower: 10,
			volatileStatus: 'fantasysachetfling',
		} as any,

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
		desc: "幻之香袋。携带道具后,当接触对方或被对方接触时,将对方的特性更改为甩不掉的气味,生效一次后消失。",
		shortDesc: "幻之香袋。当接触对方或被对方接触时,将对方的特性更改为甩不掉的气味。",
	},
};
