// 大模型调用。只支持 OpenAI 兼容的 /chat/completions —— 国内主流几家
// （DeepSeek、智谱、通义、Kimi、硅基流动……）都用这个格式，所以换供应商
// 只需要改 .env.local 里的三行地址/模型/密钥，代码一行都不用动。
//
// 知乎直答（developer.zhihu.com）也是同一套请求体，只是鉴权头不一样，所以
// 这里用一个 extraHeaders 参数把它一起覆盖了。
//
// 这个模块永远不打印密钥，也不把密钥放进任何错误信息。

const ZHIHU_ZHIDA_URL = 'https://developer.zhihu.com/v1/chat/completions';

export class ModelError extends Error {
  constructor(kind, message, status = 0) {
    super(message);
    this.name = 'ModelError';
    this.kind = kind; // config | auth | rate | timeout | server | network | empty
    this.status = status;
  }
}

// 把各种失败归成几类，好在日志和降级提示里说人话。
export function classifyStatus(status) {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate';
  if (status >= 500) return 'server';
  if (status >= 400) return 'config';
  return 'server';
}

// 从 OpenAI 兼容响应里取出正文。兼容 reasoning_content（思考型模型）和
// 数组形式的 content（少数供应商会这么返回）。
export function extractContent(payload) {
  const choice = payload?.choices?.[0];
  const message = choice?.message ?? choice?.delta ?? null;
  if (!message) return '';
  const content = message.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(part => (typeof part === 'string' ? part : part?.text || '')).join('');
  }
  return '';
}

export function createModelClient(config, {fetchImpl = fetch, now = Date.now} = {}) {
  const {baseUrl, name, key, maxTokens, timeoutMs} = config.model;

  async function post(url, headers, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: {'content-type': 'application/json', ...headers},
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const text = await response.text();
      if (!response.ok) {
        // 只保留服务端给的一句人话，不回传请求头，避免密钥意外出现在日志里
        let detail = text.slice(0, 240);
        try {
          const parsed = JSON.parse(text);
          detail = parsed?.error?.message || parsed?.message || detail;
        } catch {}
        throw new ModelError(classifyStatus(response.status), `模型接口返回 ${response.status}：${detail}`, response.status);
      }
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new ModelError('server', '模型接口返回的不是合法 JSON');
      }
      const content = extractContent(payload).trim();
      if (!content) throw new ModelError('empty', '模型返回了空内容');
      return content;
    } catch (error) {
      if (error instanceof ModelError) throw error;
      if (error?.name === 'AbortError') throw new ModelError('timeout', `模型超过 ${timeoutMs} 毫秒没有回应`);
      throw new ModelError('network', `连不上模型接口：${error?.message || error}`);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    backend: {baseUrl, name},

    // 自带的模型（OpenAI 兼容）
    async chat(messages) {
      if (!config.model.configured) throw new ModelError('config', '还没有在 .env.local 里配置 MODEL_API_KEY / MODEL_BASE_URL / MODEL_NAME');
      return post(
        `${baseUrl}/chat/completions`,
        {authorization: `Bearer ${key}`},
        {model: name, messages, max_tokens: maxTokens, temperature: 0.8, stream: false}
      );
    },

    // 可选的知乎直答后端。需要显式传密钥，且当前额度很小，仅作备选。
    async zhidaChat(messages, secret) {
      if (!secret) throw new ModelError('config', '没有可用的知乎 Access Secret');
      return post(
        ZHIHU_ZHIDA_URL,
        {
          authorization: `Bearer ${secret}`,
          'x-request-timestamp': String(Math.floor(now() / 1000))
        },
        {model: 'zhida-fast-1p5', messages, stream: false}
      );
    }
  };
}
