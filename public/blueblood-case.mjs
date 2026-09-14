// 第一幕《蓝血》的本地案件配置。
// 这里保存可公开的剧情事实，不保存任何 API 密钥；NPC 的自由对话接入时也必须以此为边界。
export const blueBloodCase = {
  title: '蓝血',
  source: 'https://api.zhihu.com/km-indep-home/hackathon/v2/story/2025684191967294692',
  sourceNote: '保留知乎官方故事中的急救培训、血色认知冲突与观察者元素；房间、道具、结局和对话为本次新增改编。',
  // 判分关键词的取词原则：**玩家必须自己推理或翻证据才说得出**。
  // 所以不能收「蓝色液体」「教具」「培训师」这类词 —— 它们印在开场白、
  // 道具名或 NPC 名牌上，玩家还没推理就已经看到了，等于白送分。
  questions: [
    { id: 'what', label: '蓝血到底是什么？', answer: '用于急救演示的蓝色模拟出血液，不是真正的人体血液。', keywords: ['模拟', '道具', '假血', '演示液'] },
    { id: 'from', label: '它从哪里来？', answer: '来自培训师教具箱里的小瓶，经假伤口贴片流到手背和地面。', keywords: ['教具', '小瓶', '瓶子', '假伤口', '贴片'] },
    { id: 'lastNight', label: '昨晚发生了什么？', answer: '培训师布置了一场假受伤演示，故意让主角以为自己看到了真实的蓝色血液，并记录主角的反应。', keywords: ['假装', '假伤', '演示', '布置', '测试', '记录', '拍摄', '观察'] },
    { id: 'liar', label: '哪个 NPC 在撒谎？', answer: '培训师在撒谎，他明知蓝色液体是演示道具，却说那是自己的血。', keywords: ['培训师', '方老师', '教练'] },
    { id: 'why', label: '他为什么撒谎？', answer: '他想观察主角面对权威解释和群体附和时，会不会放弃自己亲自确认过的判断。', keywords: ['测试', '观察', '反应', '坚持', '改口', '权威', '随众', '判断'] }
  ],
  diary: [
    { date: '7月6日', title: '早餐', text: '今天难得起早，去楼下吃了早餐。点了豆浆和两个包子，吃到一半才想起来，冰箱里还有昨天买的面包。不过热包子确实比面包好吃，这笔钱花得不算冤枉。回来的路上买了一把香蕉。老板挑了半天，说这把明天吃正好。现在它们摆在桌上，我已经吃掉两根了。明天的事，明天再说。' },
    { date: '7月10日', title: '洗衣服', text: '终于把攒了一星期的衣服洗了。晾衣服的时候发现，衣架永远不够用。明明上个月才买过一包，也不知道为什么，每次洗完衣服还是要到处找。床单晒了一下午，收回来暖烘烘的。晚上换好床单，躺下去的时候，突然觉得今天也没算白过。本来还想顺手拖地。算了，不能一天把所有勤快都用完。' },
    { date: '7月15日', title: '妈妈的番茄', text: '妈今天打电话，说阳台上的番茄终于红了两颗。她拍了好几张照片发来，一张比一张近，最后一张只能看见半颗番茄。我夸她种得好，她说等我回去就做番茄炒蛋。两颗番茄，大概只够炒一个鸡蛋。聊到最后，她又问我最近吃得好不好。我说挺好，正准备做饭。挂了电话，还是把外卖软件关掉，煮了一碗面。' },
    { date: '7月22日', title: '公园', text: '下午什么也没安排，去公园走了走。有人在草地上放风筝，折腾了很久都没飞起来。旁边的小狗比人还忙，风筝落到哪，它就追到哪。买了一根冰棍，坐在长椅上吃完。回家之前又绕了一圈，走得腿有点酸。晚上看了部喜剧，前半段挺好笑，后半段有点困。' },
    { date: '7月28日', title: '那盘没有上桌的藕盒', text: '今天聚餐，最后有点不愉快。菜快吃完的时候，我说还有一份藕盒没上。服务员看了单子，说已经上齐了。对面的人也说记得吃过，其他人跟着点头。张薇在桌子下面碰了碰我的腿，小声说：“算了吧，大家都吃饱了。”我知道她是想打圆场，也觉得继续追问很尴尬，但还是请她去厨房确认。后来经理端着藕盒出来道歉，说这道菜一直放在出餐台上，单子却提前划掉了。张薇问我：“要是最后真是你记错了呢？”我说，那就道歉。我只是不能因为一桌人都说吃过，就跟着说自己也吃过。' }
  ],
  npc: [
    { id: 'trainer', name: '培训师 · 方老师', role: '掌控演示的人', opening: '昨晚没什么特别的事。那点血是我自己划到手流的，别在这上面浪费时间。', facts: ['教具箱里有蓝色模拟液和假伤口贴片。', '他提前安排了录像，并要求拍下主角第一次提出异议的反应。', '他故意把蓝色液体说成自己的血。'], lies: ['蓝色液体是真血。', '昨晚没有额外拍摄安排。'], motive: '验证主角是否会在权威解释与旁人附和下放弃自己的判断。' },
    { id: 'zhangwei', name: '同事 · 张薇', role: '看见现象的人', opening: '我确实看见有东西从他手上滴下来，但我没看清那只手到底破没破。', facts: ['她只看见蓝色液体从培训师手背流下来，没有看清那只手到底破没破。', '她当时站得有两三步远，屋里灯不算亮，她也没敢凑近看。', '她跟主角一起吃过饭，那次为了一道菜的事，她劝过主角「算了吧」。'], lies: [], motive: '她没有骗人。她只是把「看见的现象」当成了「完整的解释」，分不清看见和看懂是两件事。' },
    { id: 'gray', name: '记录员 · 灰夹克', role: '负责带走教具的人', opening: '我只负责把东西送过去、再收回来。镜头拍到了什么，你自己看时间轴。', facts: ['他把教具箱送到房间，箱子里的东西他没动过。', '培训师只跟他说要留一段教学素材，没说要录什么。', '设备是他在结束之后去取回来的，他扫了一眼时间轴，没细看内容。'], lies: [], motive: '他只知道培训师说要留教学素材，别的一概不想管，也不愿替人担责任。' }
  ],
  props: [
    { id: 'blue-bottle', name: '蓝色模拟液瓶', category: '关键证据', action: '打开瓶盖并旋转查看', text: '瓶底有分层沉淀，瓶身贴着“急救演示用，不可接触伤口”的小标签。瓶口边缘仍有新鲜的蓝色痕迹。', supports: ['what', 'from'] },
    { id: 'fake-wound', name: '假伤口贴片', category: '关键证据', action: '翻看背面', text: '贴片背面有一条细小导管，接口处残留蓝色液体。它可以贴在皮肤上制造出血效果。', supports: ['from', 'lastNight'] },
    { id: 'gauze', name: '染蓝的纱布', category: '关键证据', action: '展开检查', text: '纱布上的蓝色只集中在表层，下面没有真实血液凝固后的深色痕迹。', supports: ['what', 'lastNight'] },
    { id: 'record-phone', name: '拍摄用手机', category: '关键证据', action: '播放录像并查看时间轴', text: '录像没有一直对着伤口，而是在你提出“血怎么会是蓝的”后，镜头明显转向了你的脸。', supports: ['lastNight', 'why'] },
    { id: 'shoot-note', name: '拍摄安排纸', category: '关键证据', action: '展开折痕', text: '纸上写着：“重点记录参与者第一次提出异议以及随后是否改口。”没有写姓名，但字迹与培训师的教案相同。', supports: ['why'] },
    { id: 'sink-residue', name: '洗手池残留', category: '辅助证据', action: '查看排水口', text: '排水口边缘残留少量蓝色液体和贴片背面的透明胶。昨晚有人在这里清理过演示痕迹。', supports: ['from', 'lastNight'] },
    { id: 'trash-kit', name: '垃圾桶里的包装', category: '辅助证据', action: '翻看内侧', text: '包装来自急救教具套装，拆封时间显示为昨天下午。', supports: ['from', 'lastNight'] },
    { id: 'door-scratch', name: '门锁和防盗链', category: '辅助证据', action: '检查门内侧', text: '门没有被撬开，防盗链却有一次急拉留下的划痕。有人离开时显得很慌张。', supports: ['lastNight'] },
    { id: 'diary', name: '主角的日记', category: '性格资料', action: '翻阅五页', text: '前四页是日常记录，最后一页写着一次聚餐时坚持核对漏上的菜。', supports: ['why'] },
    { id: 'blue-paint', name: '蓝色油漆罐', category: '干扰项', action: '打开查看', text: '只是墙漆，颜色相近，但罐口干燥，没有接触过纱布或贴片的痕迹。', supports: [] },
    { id: 'blue-label', name: '蓝标签酒瓶', category: '干扰项', action: '查看瓶身', text: '瓶子里的酒是普通颜色，蓝色只来自标签。', supports: [] },
    { id: 'old-clock', name: '停住的挂钟', category: '环境道具', action: '轻轻拨动指针', text: '电池接触不良，停在00:18，不能用来确定昨晚的准确时间。', supports: [] },
    { id: 'table', name: '积灰的圆木桌', category: '环境道具', action: '擦过桌面', text: '桌面有均匀的灰，只有急救箱放置过的位置少了一小块。', supports: ['lastNight'] },
    { id: 'sofa', name: '旧布艺沙发', category: '环境道具', action: '查看坐垫', text: '坐垫已经塌陷，布面褪色，没有提供明确线索。', supports: [] },
    { id: 'books', name: '旧书堆', category: '环境道具', action: '抽出最上面一本', text: '最上面那本比下面干净一些，可能只是最近被人翻过。', supports: [] },
    { id: 'mirror', name: '浴室镜子', category: '环境道具', action: '擦拭镜面', text: '右下角有近期擦拭痕迹，只能说明有人在卫生间靠近过镜子。', supports: ['lastNight'] }
  ]
};

// 反向表述表：玩家写出这些，说明他把「蓝血是道具」理解反了。
const CONTRADICTIONS = ['真的人体血', '真血', '自然流出', '普通清洁剂'];
const AFFIRM = /是|为|属于/;
const NEGATIONS = /不|非|没|无|别|否认|推翻|道具|模拟|假装/;

// 判断一个词是「被主张了」还是「被否定 / 被描述」：
//   「那其实是真血」    → 主张了
//   「是道具，不是真血」 → 否定，不算
//   「他把道具说成真血」 → 在描述这个谎，不算
function asserted(text, word, needAffirm) {
  for (let from = 0; ;) {
    const at = text.indexOf(word, from);
    if (at < 0) return false;
    const before = text.slice(Math.max(0, at - 5), at);
    if ((!needAffirm || AFFIRM.test(before)) && !NEGATIONS.test(before)) return true;
    from = at + word.length;
  }
}

// 「哪个 NPC 在撒谎」要求**唯一**指认。把三个名字一起粘上去不该得分 ——
// 那是抄名牌，不是指认。带否定的排除句（「不是张薇，是培训师」）仍然算对。
const SUSPECTS = [['trainer', ['培训师', '方老师', '教练']], ['zhangwei', ['张薇']], ['gray', ['灰夹克']]];
function namedOnly(text) {
  const named = SUSPECTS
    .filter(([, words]) => words.some(word => asserted(text, word, false)))
    .map(([id]) => id);
  return named.length === 1 ? named[0] : '';
}

export function scoreAnswer(question, value = '') {
  const text = String(value).trim().toLowerCase();
  if (!text) return 0;
  if (question.id === 'liar') return namedOnly(text) === 'trainer' ? 1 : 0;
  const positive = question.keywords.filter(word => text.includes(word.toLowerCase())).length;
  const contradiction = CONTRADICTIONS.some(word => asserted(text, word, true));
  if (question.id === 'why') return positive >= 2 && !contradiction ? 1 : 0;
  return positive >= (question.id === 'lastNight' ? 2 : 1) && !contradiction ? 1 : 0;
}
