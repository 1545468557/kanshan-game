// NPC 对话服务：把「问一句 → 得到一句台词」这件事包成一条可控的流水线。
//
// 顺序是刻意的，先便宜后昂贵：
//   1. 校验输入          —— 不花一分钱
//   2. 每人限流          —— 不花一分钱
//   3. 查缓存            —— 同一个问题第二次问，零成本
//   4. 合并并发同问      —— 两个人同时问同一句，只花一次
//   5. 当日总预算        —— 花超了就停下
//   6. 真的调模型
// 任何一步没过，都返回 fallback 信号，让前端用它本来就有的本地预设台词顶上。
// 也就是说：模型挂了，游戏照样能玩完。

import {createHash} from 'node:crypto';
import {buildMessages, buildSystemPrompt, cleanReply, looksInCharacter, pressureLevel, personaOf} from './npc-persona.mjs';
import {ModelError} from './model-client.mjs';

export function normalizeQuestion(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[。！？!?，,、~～。\s]+$/g, '')
    .toLowerCase();
}

export function localDateKey(timestamp) {
  const date = new Date(timestamp);
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// 不保存原始 IP：用当天轮换的盐做一次短哈希，既能区分访客，又不留可追溯的个人信息。
export function hashIp(ip, dayKey) {
  return createHash('sha256').update(`${dayKey}|${ip || 'unknown'}`).digest('hex').slice(0, 12);
}

export function createRateLimiter({max, windowMs}) {
  const hits = new Map();
  function take(key, timestamp) {
    const list = (hits.get(key) || []).filter(at => timestamp - at < windowMs);
    if (list.length >= max) {
      hits.set(key, list);
      return {allowed: false, retryAfterMs: windowMs - (timestamp - list[0])};
    }
    list.push(timestamp);
    hits.set(key, list);
    // 顺手清掉过期条目，避免长期运行时内存缓慢增长
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (!v.length || timestamp - v[v.length - 1] > windowMs) hits.delete(k);
    }
    return {allowed: true, retryAfterMs: 0};
  }
  return {take};
}

export function createDailyBudget({limit}) {
  let state = {date: null, used: 0};
  return {
    take(dayKey) {
      if (state.date !== dayKey) state = {date: dayKey, used: 0};
      if (state.used >= limit) return false;
      state.used += 1;
      return true;
    },
    refund(dayKey) {
      if (state.date === dayKey && state.used > 0) state.used -= 1;
    },
    snapshot(dayKey) {
      return {date: dayKey, used: state.date === dayKey ? state.used : 0, limit};
    }
  };
}

// 提示词的指纹（FNV-1a 折成 36 进制短串）。
// 缓存键里必须带上它，否则改了人设之后旧回答会继续被端上来 ——
// 实测踩过：给提示词补上「别人的代词」修掉了性别说错的问题，
// 但同一个问题再问还是拿到缓存里的旧台词，看上去像是修复没生效。
// 带上指纹以后，改了人设就自动换成新回答，不用记得去清缓存。
export function promptFingerprint(text) {
  const value = String(text || '');
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

// 折成一个「笼统但稳定」的压力档位，让缓存能命中，同时台词又随证据量变化。
export function cacheKeyOf(npcId, question, observed, fingerprint = '') {
  const pressure = pressureLevel(observed);
  return `${npcId}|${pressure}|${fingerprint}|${normalizeQuestion(question)}`;
}

export function createNpcService({config, modelClient, store, now = Date.now, zhihuSecret = ''}) {
  const cache = store.loadCache();
  const limiter = createRateLimiter({
    max: config.limits.rateMaxPerWindow,
    windowMs: config.limits.rateWindowMs
  });
  const budget = createDailyBudget({limit: config.limits.dailyModelBudget});
  const inFlight = new Map();

  let cacheHits = 0;
  let modelCalls = 0;
  let fallbacks = 0;

  async function generate({npcId, question, pressure, history}) {
    const messages = buildMessages({npcId, question, pressure, history});
    // 默认用自己配置的模型。只有在自己没配、或显式要求「优先直答」时才走知乎直答。
    // 直答目前的每日额度很小，不适合当主力。
    const preferZhida = config.zhihu?.mode === 'always' && Boolean(zhihuSecret);
    const raw = config.model.configured && !preferZhida
      ? await modelClient.chat(messages)
      : await modelClient.zhidaChat(messages, zhihuSecret);
    const reply = cleanReply(raw);
    if (!looksInCharacter(reply)) throw new ModelError('empty', '模型这句话不符合角色设定，已弃用');
    return reply;
  }

  return {
    async ask({npcId, question, observed = [], history = [], ip = '', sessionId = ''}) {
      const timestamp = now();
      const dayKey = localDateKey(timestamp);
      const asked = String(question || '').trim();

      const record = (reply, source, reason) => {
        store.addRecord({
          ts: timestamp,
          day: dayKey,
          session: String(sessionId || '').slice(0, 40),
          ip: hashIp(ip, dayKey),
          npcId,
          question: asked.slice(0, config.limits.maxQuestionChars),
          reply: String(reply || '').slice(0, 400),
          source,
          reason: reason || null,
          pressure: pressureLevel(observed)
        });
      };

      const deny = (reason, message) => {
        fallbacks += 1;
        record('', 'fallback', reason);
        return {ok: false, fallback: true, reason, message};
      };

      if (!personaOf(npcId)) return {ok: false, fallback: true, reason: 'invalid_npc', message: '没有这个人物'};
      if (!asked) return {ok: false, fallback: true, reason: 'empty', message: '问题是空的'};
      if (asked.length > config.limits.maxQuestionChars) {
        return {ok: false, fallback: true, reason: 'too_long', message: `一次最多问 ${config.limits.maxQuestionChars} 个字`};
      }

      const verdict = limiter.take(hashIp(ip, dayKey), timestamp);
      if (!verdict.allowed) {
        return deny('rate', '问得有点快，先缓一缓。这几句先用现场记录里的说法。');
      }

      const pressure = pressureLevel(observed);
      // 指纹取自「这一档压力下真正会发给模型的提示词」，所以改人设、改回答规则、
      // 甚至改压力档的措辞，都会让相关缓存自动失效。
      const key = cacheKeyOf(npcId, asked, observed, promptFingerprint(buildSystemPrompt(npcId, {pressure})));

      const cached = cache.get(key);
      if (cached) {
        cacheHits += 1;
        record(cached.reply, 'cache');
        return {ok: true, source: 'cache', reply: cached.reply, pressure};
      }

      if (!config.model.configured && !zhihuSecret) {
        return deny('no_key', '这台机器还没有配置大模型密钥，先用现场记录里的说法。（在项目目录运行 npm run setup 可以一步步配好）');
      }

      if (inFlight.has(key)) {
        try {
          const reply = await inFlight.get(key);
          cacheHits += 1;
          record(reply, 'cache');
          return {ok: true, source: 'cache', reply, pressure};
        } catch {
          return deny('error', '刚才那句话没能取回来，先用现场记录里的说法。');
        }
      }

      if (!budget.take(dayKey)) {
        return deny('budget', '今天的模型额度已经用完了，先用现场记录里的说法。');
      }

      const task = generate({npcId, question: asked, pressure, history});
      inFlight.set(key, task);
      try {
        const reply = await task;
        modelCalls += 1;
        cache.set(key, {key, reply, npcId, pressure, at: timestamp});
        store.saveCacheEntry(key, reply, {npcId, pressure, at: timestamp});
        record(reply, 'model');
        return {ok: true, source: 'model', reply, pressure};
      } catch (error) {
        // 调用失败不占用当日预算：失败不该让玩家买单
        budget.refund(dayKey);
        const kind = error instanceof ModelError ? error.kind : 'error';
        return deny(kind, `模型这边出了点问题（${kind}），先用现场记录里的说法。`);
      } finally {
        inFlight.delete(key);
      }
    },

    stats(dayKey = localDateKey(now())) {
      return {
        ...budget.snapshot(dayKey),
        cacheEntries: cache.size,
        cacheHits,
        modelCalls,
        fallbacks,
        pending: inFlight.size
      };
    }
  };
}
