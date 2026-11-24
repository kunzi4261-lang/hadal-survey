// All names, coordinates, instrument readings and expedition incidents are fictional.
const site = (id, kind, name, x, z, method, seconds, signal, clue, description) => ({
  id,
  kind,
  name,
  x,
  z,
  method,
  seconds,
  signal,
  clue,
  description,
});

export const ZONES = [
  {
    id: 'shelf',
    code: 'HS-01',
    name: '蓝石陆架',
    subtitle: '失踪的同步脉冲',
    depth: 186,
    sonarRadius: 87,
    current: 0.12,
    color: '#65ddcf',
    brief: '退役观测网「候潮」仍在整点发送一串回波。沿旧航道检查珊瑚、信标和沉船，查出它的发射源。',
    debrief:
      '珊瑚在记录光，信标在转发时间，沉船自己早已断电。把三份时标对齐，脉冲来自更深处的中继，而陆架只是它的扬声器。',
    question: '哪一项解释能同时符合陆架的三份记录？',
    hint: '把亮线的方向、信标收发时差和船上的空电池架放在一起看。',
    answers: ['沉船重新启动了发射机', '陆架信标在复述更深处的时标', '珊瑚发出了同步电信号'],
    correctIndex: 1,
    sites: [
      site(
        'shelf-coral',
        'coral',
        '珊瑚光标',
        8,
        32,
        '光谱测绘',
        2.6,
        '双峰光谱',
        '正前方的石台上有一片扇形轮廓。',
        '扇状珊瑚旁的玻璃照度计还留着三道等距亮线。相邻亮线间距相同，最亮的部分都朝向旧航道。这里记录的是有规律的外来光源。',
      ),
      site(
        'shelf-beacon',
        'beacon',
        '三号航标',
        -46,
        76,
        '时钟校验',
        3.2,
        '三短一长',
        '西北侧有一个周期性窄回波。',
        '浮标基座的光电头每隔八秒闪烁一次。接收端的原始时标比本地闪光早了四毫秒；这台设备仍在转发从别处送来的同步信号。',
      ),
      site(
        'shelf-wreck',
        'wreck',
        '白砾号船尾',
        54,
        109,
        '铭牌拓读',
        3.6,
        '金属宽带',
        '向东北扫过开阔水域，查找长条金属轮廓。',
        '船尾机柜中没有电池，电缆接线图却保存完好：向下山侧的线缆连着一组热区中继器。下一枚中继的编号是 V-02。',
      ),
    ],
  },
  {
    id: 'vent',
    code: 'HS-02',
    name: '焰柱裂谷',
    subtitle: '热泉里的第二只钟',
    depth: 2140,
    sonarRadius: 72,
    current: 0.54,
    color: '#f5a65d',
    brief: 'V-02 的信号穿过热液喷口。对照矿物烟羽、管虫群旁的探头和着陆器，判断这枚中继怎样维持供电。',
    debrief:
      '喷口给出热端，虫群旁的探头标出冷端，着陆器记录了两端的温差。V-02 的供电回路还在工作；它的输出线上另有一道从海沟返回的应答。',
    question: 'V-02 能持续工作的能源线索是什么？',
    hint: 'H 和 C 分别接在什么位置？着陆器同时读取这两路探头。',
    answers: ['深处仍有日光照到充电板', '每次闪光都重新启动了一块电池', '热端与冷端之间稳定的温差'],
    correctIndex: 2,
    sites: [
      site(
        'vent-chimney',
        'chimney',
        '黑烟烟囱',
        -9,
        36,
        '热流剖面',
        3.1,
        '散射烟羽',
        '最浓的烟羽从正前方偏西升起。',
        '旧探头的屏蔽罩贴着烟囱根部，导热片延伸到矿壳中。铭牌只剩一个 H。烟羽一侧的外壳长期受热，远侧的外壳却完整。',
      ),
      site(
        'vent-tubeworm',
        'tubeworm',
        '白冠虫庭',
        53,
        75,
        '温差采样',
        3.3,
        '低幅簇群',
        '东北侧的岩阶背流，声呐上有一片细密斑点。',
        '管虫群旁的冷端探头覆着灰白细泥，工程标签 C 仍能读出。这条细线绕开喷口，沿低温海水进入着陆器底板。',
      ),
      site(
        'vent-lander',
        'lander',
        'V-02 着陆器',
        -57,
        124,
        '中继解码',
        4.0,
        '方形框架',
        '沿裂谷向西北搜索三角状的仪器支架。',
        '着陆器以 H、C 两路温差为同步电路供电。记录表里同时存在「发送」和「应答」两列；后者只可能来自更低处的终端 T-09。',
      ),
    ],
  },
  {
    id: 'trench',
    code: 'HS-03',
    name: '无月海沟',
    subtitle: '九号终端的回信',
    depth: 6180,
    sonarRadius: 68,
    current: 0.28,
    color: '#a99af2',
    brief:
      '沿海沟边缘追踪 T-09。先用漂流生物估算横流，再核验地缆去向，读取观测站保存的最后一句值班留言。',
    debrief:
      '九号站从未呼救。它一直在做自己最后的工作：当科学数据写入海底档案，就向海面寄出一组校验回声。值班员留下的那句话终于有了回信——「有人听见，就替我们把记录带回去。」',
    question: '整条观测链传向陆架的究竟是什么？',
    hint: '接续盒刻着 ACK，日志里的每笔回送之前都有一次完整写入。',
    answers: ['每次档案写入成功后的校验回声', '持续六千米的即时求救语音', '遇到逆流时的推进器报警'],
    correctIndex: 0,
    sites: [
      site(
        'trench-jelly',
        'jelly',
        '漂灯水母群',
        9,
        35,
        '漂移摄影',
        2.8,
        '移动光点',
        '观察前方缓慢移动的一团冷光。',
        '逐帧记录显示，水母群随横流缓缓东漂；远处按八秒重复的光点却始终留在原位。真正的应答源固定在海床。',
      ),
      site(
        'trench-cable',
        'cable',
        '零号接续盒',
        -44,
        86,
        '缆线追踪',
        3.5,
        '线性反射',
        '西北侧地面上，一段回波折成近似直角。',
        '接续盒的出线箭头指向东北，光纤尾端能看到成对的闪烁。旁边的耐压板刻着「ACK」，这是一个确认通道。',
      ),
      site(
        'trench-observatory',
        'observatory',
        '九号听潮站',
        41,
        138,
        '档案校验',
        4.4,
        '环形舱壳',
        '沿接续盒的指向找到观测站的主舱。',
        '主舱的最后一页日志按序列列出「写入、校验、回送」。每写完一页观测数据，就有一束确认光沿缆线上行。盒盖内侧有一行手写留言：「有人听见，就替我们把记录带回去。」',
      ),
    ],
  },
];

export function getZone(id) {
  return ZONES.find((zone) => zone.id === id);
}

/** Local seabed height in metres; Y increases upwards. */
export function floorHeight(zone, x, z) {
  const ripple =
    Math.sin(x * 0.078 + Math.cos(z * 0.045)) * 0.65 + Math.sin(z * 0.13 + x * 0.032) * 0.31;
  if (zone === 'vent') {
    const channel = x - 23 * Math.sin(z * 0.026);
    return (
      3.7 * Math.sin(z * 0.032 + x * 0.015) - 5 * Math.exp((-channel * channel) / 380) + ripple * 1.6
    );
  }
  if (zone === 'trench') {
    const channel = x + 18 * Math.cos(z * 0.021);
    return 3 * Math.sin(x * 0.045 + z * 0.019) - 6.4 * Math.exp((-channel * channel) / 800) + ripple;
  }
  return 2.9 * Math.sin(x * 0.028 + z * 0.014) + 2.1 * Math.cos(z * 0.035 - x * 0.016) + ripple;
}
