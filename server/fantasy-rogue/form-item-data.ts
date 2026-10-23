import type { RogueItem } from './types';

export const FORM_ITEMS: (RogueItem & { species: string[], forms?: string[], consumed?: boolean })[] = [
	{ id: 'dnasplicers', name: '基因之楔', species: ['Kyurem'], icon: 'dna-splicers', description: '将【酋雷姆】与队内的【莱希拉姆】或【捷克罗姆】融合；再次使用可解除，归还伙伴。' },
	{ id: 'reins of unity', name: '牵绊缰绳', species: ['Calyrex'], icon: 'reins-of-unity', description: '将【蕾冠王】与队内的【雪暴马】或【灵幽马】融合；再次使用可解除，归还伙伴。' },
	{ id: 'zygarde cube', name: '基格尔德多面体', species: ['Zygarde'], icon: 'zygarde-cube', forms: ['Zygarde-10%', 'Zygarde'], description: '在【基格尔德】10% 与 50% 形态之间切换，特性均为【群聚变形】。' },
	{ id: 'reveal glass', name: '现形镜', species: ['Tornadus', 'Thundurus', 'Landorus', 'Enamorus'], icon: 'reveal-glass', description: '在化身形态与灵兽形态之间切换。' },
	{ id: 'prison bottle', name: '惩戒之壶', species: ['Hoopa'], icon: 'prison-bottle', forms: ['Hoopa', 'Hoopa-Unbound'], description: '在【惩戒胡帕】与【解放胡帕】之间切换。' },
	{ id: 'gracidea', name: '葛拉西蒂亚花', species: ['Shaymin'], icon: 'gracidea', forms: ['Shaymin', 'Shaymin-Sky'], description: '白天且未被冰冻时，可将【谢米】变为天空形态；也可切回陆上形态。' },
	{ id: 'meteorite', name: '陨石', species: ['Deoxys'], icon: 'meteorite', forms: ['Deoxys', 'Deoxys-Attack', 'Deoxys-Defense', 'Deoxys-Speed'], description: '切换【代欧奇希斯】的普通、攻击、防御、速度形态。' },
	{ id: 'rotom catalog', name: '洛托姆型录', species: ['Rotom'], icon: 'rotom-catalog', forms: ['Rotom', 'Rotom-Heat', 'Rotom-Wash', 'Rotom-Frost', 'Rotom-Fan', 'Rotom-Mow'], description: '切换【洛托姆】的家电形态，并更换该家电的专属招式。' },
	{ id: 'n solarizer', name: '奈克洛索尔合体器', species: ['Necrozma'], icon: 'n-solarizer', description: '将【奈克洛兹玛】与队内的【索尔迦雷欧】融合；再次使用可解除，归还伙伴。' },
	{ id: 'n lunarizer', name: '奈克洛露奈合体器', species: ['Necrozma'], icon: 'n-lunarizer', description: '将【奈克洛兹玛】与队内的【露奈雅拉】融合；再次使用可解除，归还伙伴。' },
	{ id: 'rednectar', name: '朱红色花蜜', species: ['Oricorio'], icon: 'red-nectar', forms: ['Oricorio'], description: '将【花舞鸟】变为热辣热辣风格。' },
	{ id: 'yellow nectar', name: '金黄色花蜜', species: ['Oricorio'], icon: 'yellow-nectar', forms: ['Oricorio-Pom-Pom'], description: '将【花舞鸟】变为啪滋啪滋风格。' },
	{ id: 'pink nectar', name: '桃粉色花蜜', species: ['Oricorio'], icon: 'pink-nectar', forms: ['Oricorio-Pa\'u'], description: '将【花舞鸟】变为呼拉呼拉风格。' },
	{ id: 'purple nectar', name: '兰紫色花蜜', species: ['Oricorio'], icon: 'purple-nectar', forms: ['Oricorio-Sensu'], description: '将【花舞鸟】变为轻盈轻盈风格。' },
].map(item => ({ ...item, id: item.id.replace(/ /g, ''), kind: 'forme', price: 0, shopFloor: false,
	consumed: item.id.endsWith('nectar'), description: item.description + (item.id.endsWith('nectar') ? '使用后消耗。' : '') }));

export function formItem(id: string) { return FORM_ITEMS.find(item => item.id === id); }
