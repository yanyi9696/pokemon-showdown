export const Items: import('../../../sim/dex-items').ModdedItemDataTable = {
	//以下为mega石 num从10000开始
	victreebelite: {
		name: "Victreebelite",
		spritenum: 613, 
		megaStone: "Victreebel-Mega",
		megaEvolves: "Victreebel",
		itemUser: ["Victreebel"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10000, 
		gen: 9, 
		desc: "大食花超级石。让大食花携带后,在战斗时就能进行超级进化",
		shortDesc: "大食花超级石。让大食花携带后,在战斗时就能进行超级进化",
	},
	hawluchaite: {
		name: "Hawluchaite",
		spritenum: 584, 
		megaStone: "Hawlucha-Mega",
		megaEvolves: "Hawlucha",
		itemUser: ["Hawlucha"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10001, 
		gen: 9, 
		desc: "摔角鹰人超级石。让摔角鹰人携带后,在战斗时就能进行超级进化",
		shortDesc: "摔角鹰人超级石。让摔角鹰人携带后,在战斗时就能进行超级进化",
	},
	chandelureite: {
		name: "Chandelureite",
		spritenum: 577, 
		megaStone: "Chandelure-Mega",
		megaEvolves: "Chandelure",
		itemUser: ["Chandelure"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10002, 
		gen: 9, 
		desc: "水晶灯火灵超级石。让水晶灯火灵携带后,在战斗时就能进行超级进化",
		shortDesc: "水晶灯火灵超级石。让水晶灯火灵携带后,在战斗时就能进行超级进化",
	},
	froslassite: {
		name: "Froslassite",
		spritenum: 630, 
		megaStone: "Froslass-Mega",
		megaEvolves: "Froslass",
		itemUser: ["Froslass"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10003, 
		gen: 9, 
		desc: "雪妖女超级石。让雪妖女携带后,在战斗时就能进行超级进化",
		shortDesc: "雪妖女超级石。让雪妖女携带后,在战斗时就能进行超级进化",
	},
	delphoxite: {
		name: "Delphoxite",
		spritenum: 591, 
		megaStone: "Delphox-Mega",
		megaEvolves: "Delphox",
		itemUser: ["Delphox"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10004, 
		gen: 9, 
		desc: "妖火红狐超级石。让妖火红狐携带后,在战斗时就能进行超级进化",
		shortDesc: "妖火红狐超级石。让妖火红狐携带后,在战斗时就能进行超级进化",
	},
	dragalgite: {
		name: "Dragalgite",
		spritenum: 588, 
		megaStone: "Dragalge-Mega",
		megaEvolves: "Dragalge",
		itemUser: ["Dragalge"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10005, 
		gen: 9, 
		desc: "毒藻龙超级石。让毒藻龙携带后,在战斗时就能进行超级进化",
		shortDesc: "毒藻龙超级石。让毒藻龙携带后,在战斗时就能进行超级进化",
	},
	excadrite: {
		name: "Excadrite",
		spritenum: 605, 
		megaStone: "Excadrill-Mega",
		megaEvolves: "Excadrill",
		itemUser: ["Excadrill"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10006, 
		gen: 9, 
		desc: "龙头地鼠超级石。让龙头地鼠携带后,在战斗时就能进行超级进化",
		shortDesc: "龙头地鼠超级石。让龙头地鼠携带后,在战斗时就能进行超级进化",
	},
	meganiumite: {
		name: "Meganiumite",
		spritenum: 587, 
		megaStone: "Meganium-Mega",
		megaEvolves: "Meganium",
		itemUser: ["Meganium"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10007, 
		gen: 9, 
		desc: "大竺葵超级石。让大竺葵携带后,在战斗时就能进行超级进化",
		shortDesc: "大竺葵超级石。让大竺葵携带后,在战斗时就能进行超级进化",
	},
	greninjite: {
		name: "Greninjite",
		spritenum: 585, 
		megaStone: "Greninja-Mega",
		megaEvolves: "Greninja",
		itemUser: ["Greninja"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10008, 
		gen: 9, 
		desc: "甲贺忍蛙超级石。让甲贺忍蛙携带后,在战斗时就能进行超级进化",
		shortDesc: "甲贺忍蛙超级石。让甲贺忍蛙携带后,在战斗时就能进行超级进化",
	},
	starminite: {
		name: "Starminite",
		spritenum: 629, 
		megaStone: "Starmie-Mega",
		megaEvolves: "Starmie",
		itemUser: ["Starmie"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10009, 
		gen: 9, 
		desc: "宝石海星超级石。让宝石海星携带后,在战斗时就能进行超级进化",
		shortDesc: "宝石海星超级石。让宝石海星携带后,在战斗时就能进行超级进化",
	},
	//以下为Z num从20000开始
	toxtricityz: {
		name: "Toxtricity Z",
		spritenum: 686,
		onTakeItem: false, // Z纯晶不能被移除
		zMove: "Chaopinyaogunpoyinbo",
		zMoveFrom: "Overdrive",
		itemUser: ["Toxtricity-Fantasy", "Toxtricity-Low-Key-Fantasy"], // 再次确认形态名称
		num: 20000,
		gen: 9,
		desc: "颤弦蝾螈Z。颤弦蝾螈携带后,可以把破音转化成特殊的Ｚ招式: 超频摇滚破音波",
		shortDesc: "颤弦蝾螈Z。颤弦蝾螈携带后,可以把破音转化成特殊的Ｚ招式: 超频摇滚破音波",
	},
	greninjaashz: {
		name: "Greninja-Ash Z",
		spritenum: 633,
		onTakeItem: false, // Z纯晶不能被移除
		zMove: "Huangjinjibanshoulijian",
		zMoveFrom: "Water Shuriken",
		itemUser: ["Greninja-Bond-Fantasy", "Greninja-Ash-Fantasy"], // 再次确认形态名称
		num: 20002,
		gen: 9,
		desc: "智忍蛙Z。甲贺忍蛙-牵绊携带后,可以把飞水手里剑转化成特殊的Ｚ招式：黄金羁绊手里剑",
		shortDesc: "智忍蛙Z。甲贺忍蛙-牵绊携带后,可以把飞水手里剑转化成特殊的Ｚ招式：黄金羁绊手里剑",
	},
	//以下为Z和mega石以外的自制道具 num从30000开始
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
		num: 30000,
		gen: 9,
		desc: "幻之力量镜。携带后,虽然攻击将无法击中要害,但命中不满100%的非变化类技能命中率与威力会提升1.2倍",
		shortDesc: "幻之力量镜。攻击无法击中要害,命中不满100%的非变化技能威力与命中率提升1.2倍",
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
		num: 30001,
		gen: 9,
		desc: "幻之标靶。携带后,登场会暴露道具,虽然无法使用变化招式,但使用的原本属性相性没有效果的招式会变为有效果",
		shortDesc: "幻之标靶。登场时暴露道具,使用的招式无视属性免疫,但无法使用变化招式",
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
            this.debug('幻之生命宝珠:因异常状态,获得伤害减免30%。');
            // 使用 chainModify 来应用乘算修饰。4096 * 0.7 = 2867
            return this.chainModify(2867 / 4096);
			}
		},
		onResidual(pokemon) {
			if (pokemon.status && ['brn', 'par', 'slp', 'frz', 'psn', 'tox'].includes(pokemon.status)) {
				this.damage(pokemon.baseMaxhp / 10, pokemon, pokemon, this.dex.items.get('fantasylifeorb'));
			}
		},
		//不受异常状态效果影响的效果分别写在各个异常状态里了
		num: 30002,
		gen: 9,
		desc: "幻之生命宝珠。携带后, 不受异常状态效果影响,处于异常状态下的宝可梦,受到的伤害降低30%,但回合结束时将损失最大HP的1/10",
		shortDesc: "幻之生命宝珠。异常状态效果无效,异常状态下伤害减免30%,每回合损血1/10",
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
			for (const i in boost) {
				if (boost[i] > 0) {
					hasBoost = true;
					delete boost[i];
				}
			}
			if (hasBoost) {
				this.add('-fail', target, 'boost', '[from] item: Fantasy Sachet');
			}
		},

		onModifyMove(move, pokemon) {
			if (!move.flags['contact'] || !pokemon.hasItem('fantasysachet')) return;
			
			move.onAfterMoveSecondary = (target, source) => {
				if (!source || !target || target.isAlly(source) || target === source) return;

				if (source.useItem()) {
					this.add('-activate', source, 'item: Fantasy Sachet');

					const affected = target;
					// 建立一个权威的、不可更改特性的“黑名单”
					const unchangeableAbilities = [
						// 官方永久特性
						'asone', 'battlebond', 'comatose', 'commander', 'disguise', 'gulpmissile', 'hadronengine', 'iceface', 
						'multitype', 'orichalcumpulse', 'powerconstruct', 'protosynthesis', 'quarkdrive', 'rkssystem', 'schooling', 'shieldsdown', 
						'stancechange', 'terashift', 'zenmode', 'zerotohero',
						// 效果相关特性
						'lingeringaroma', 'mummy',
						// 你的自定义永久特性
						'woju',
					];

					if (unchangeableAbilities.includes(affected.ability)) {
						// 如果对方的特性在此名单中，则判定失败
						this.add('-fail', source);
					} else if (affected.hasItem('abilityshield')) {
						// 对特性护具的检查保持不变
						this.add('-block', affected, 'item: Ability Shield');
					} else {
						// 成功改变特性
						affected.baseAbility = 'lingeringaroma' as ID;
						affected.setAbility('lingeringaroma');
						this.add('-ability', affected, 'Lingering Aroma', '[from] item: Fantasy Sachet', '[of] ' + source);
					}
				}
			};
		},

		onDamagingHit(damage, target, source, move) {
			if (!move.flags['contact'] || !target.hasItem('fantasysachet')) return;
			if (!source || source.isAlly(target) || source === target) return;

			const sachetHolder = target;

			if (sachetHolder.useItem()) {
				this.add('-activate', sachetHolder, 'item: Fantasy Sachet');

				const affected = source;
				// 同样在这里使用权威的“黑名单”
				const unchangeableAbilities = [
						// 官方永久特性
						'asone', 'battlebond', 'comatose', 'commander', 'disguise', 'gulpmissile', 'hadronengine', 'iceface', 
						'multitype', 'orichalcumpulse', 'powerconstruct', 'protosynthesis', 'quarkdrive', 'rkssystem', 'schooling', 'shieldsdown', 
						'stancechange', 'terashift', 'zenmode', 'zerotohero',
						// 效果相关特性
						'lingeringaroma', 'mummy',
						// 你的自定义永久特性
						'woju',
				];

				if (unchangeableAbilities.includes(affected.ability)) {
					this.add('-fail', sachetHolder);
				} else if (affected.hasItem('abilityshield')) {
					this.add('-block', affected, 'item: Ability Shield');
				} else {
					affected.baseAbility = 'lingeringaroma' as ID;
					affected.setAbility('lingeringaroma');
					this.add('-ability', affected, 'Lingering Aroma', '[from] item: Fantasy Sachet', '[of] ' + sachetHolder);
				}
			}
		},
		num: 30003,
		gen: 9,
		desc: "幻之香袋。携带道具后将无法提升能力,当接触对方或被对方接触时,将对方的特性更改为甩不掉的气味,生效一次后消失",
		shortDesc: "幻之香袋。无法提升能力,当双方接触时,将对手的特性变为甩不掉的气味",
	},
	fantasyscopelens: {
		name: "Fantasy Scope Lens",
		spritenum: 429,
		fling: {
			basePower: 10,
		},
		onAnyModifyDef(def, target, source, move) {
			if (!source || source.item !== 'fantasyscopelens') return;
			if (move.flags['shooting'] || move.flags['bullet']) {
				
				// 【核心修正】道具会主动检查使用者是否拥有“穿透”特性
				if (source.hasAbility('infiltrator')) {
					// 如果有，则执行我们期望的“加算”逻辑 (10% + 20% = 30%削减)
					this.debug('Fantasy Scope Lens + Infiltrator combined additive drop');
					return this.chainModify(0.7); // 1 - 0.3 = 0.7
				} else {
					// 如果没有，就只执行道具自己的20%削减效果
					this.debug('Fantasy Scope Lens Def drop');
					return this.chainModify(0.8);
				}
			}
		},
		onAnyModifySpD(spd, target, source, move) {
			if (!source || source.item !== 'fantasyscopelens') return;
			if (move.flags['shooting'] || move.flags['bullet']) {

				// 【核心修正】(同上)
				if (source.hasAbility('infiltrator')) {
					this.debug('Fantasy Scope Lens + Infiltrator combined additive drop');
					return this.chainModify(0.7);
				} else {
					this.debug('Fantasy Scope Lens SpD drop');
					return this.chainModify(0.8);
				}
			}
		},
		num: 30004,
		gen: 9,
		desc: "幻之焦点镜。携带后,使用射击类、球和弹类招式能无视目标20%的防御与特防",
		shortDesc: "幻之焦点镜。携带后,使用射击类、球和弹类招式能无视目标20%的防御与特防",
	},
	fantasysyrupyapple: {
		name: "Fantasy Syrupy Apple",
		spritenum: 755,
		fling: {
			basePower: 30,
		},
		// 效果1：降低物攻
		onModifyAtk(atk) {
			// 将物攻值乘以0.8，即降低20%
			return this.chainModify(0.8);
		},
		// 效果1：降低特攻
		onModifySpA(spa) {
			// 将特攻值乘以0.8，即降低20%
			return this.chainModify(0.8);
		},
		// 效果2：回合结束时恢复HP
		onResidual(pokemon) {
			// 为宝可梦恢复其最大HP的1/10
			this.heal(pokemon.baseMaxhp / 10);
		},
		num: 30005,
		gen: 9,
		desc: "幻之蜜汁苹果。携带后,回合结束时恢复最大HP的1/10,但物攻和特攻降低20%",
		shortDesc: "幻之蜜汁苹果。携带后,回合结束时恢复最大HP的1/10,但物攻和特攻降低20%",
	},
	fantasyprotector: {
		name: "Fantasy Protector",
		spritenum: 367,
		fling: {
			basePower: 80,
		},
		// 效果1：提升物防
		onModifyDef(def) {
			// 将物防值乘以1.2，即提升20%
			return this.chainModify(1.2);
		},
		// 效果1：提升特防
		onModifySpD(spd) {
			// 将特防值乘以1.2，即提升20%
			return this.chainModify(1.2);
		},
		// 效果2：降低速度
		onModifySpe(spe) {
			// 将速度值乘以0.5，即降低一半
			return this.chainModify(0.5);
		},
		num: 30006,
		gen: 9,
		desc: "幻之护具。携带后,虽然物防和特防将提高20%,但速度会降低至原来的一半",
		shortDesc: "幻之护具。携带后,物防和特防提高20%,但速度会降低至原来的一半",
	},
};
