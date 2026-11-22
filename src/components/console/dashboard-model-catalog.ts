// These are upstream identifiers exercised by Platform's
// internal/modelgateway/live_test.go. An operator can give a gateway alias any name.
export interface DashboardModel {
  id: string;
  upstreamIds: readonly string[];
  name: string;
  brand: string;
  providerName: string;
  profile: string;
  gatewayNote: string;
  band: string;
  docs: string;
  tags: readonly string[];
  description: string;
  inputs: string;
  contextWindow: string;
  maxOutput: string;
  reasoning: string;
  pricing: {
    url: string;
    terms: string;
    uncachedInput: string;
    output: string;
    cachedInput: string;
    cacheWrites?: readonly { ttl: string; price: string }[];
  };
}

export const dashboardModels: readonly DashboardModel[] = [
  {
    id: "deepseek-flash",
    // The provider's Models & Pricing identifies both legacy names as Flash.
    upstreamIds: [
      "deepseek-flash",
      "deepseek-v4-flash",
      "deepseek-v4-flash-vision-exp",
    ],
    name: "DeepSeek V4.1 Flash",
    brand: "deepseek",
    providerName: "DeepSeek",
    profile: "deepseek",
    gatewayNote:
      "The DeepSeek profile supports Messages and Chat Completions. Managed Agents can replay reasoning from earlier turns when continuing a DeepSeek tool call.",
    band: "bg-[#c0d8f5] dark:bg-[#283b54]",
    docs: "https://api-docs.deepseek.com/news/news261017/",
    tags: ["Tools", "Vision"],
    description: "Coding and tool use with optional reasoning.",
    inputs: "Text and images",
    contextWindow: "1M",
    maxOutput: "384K tokens",
    reasoning: "Optional",
    pricing: {
      url: "https://api-docs.deepseek.com/quick_start/pricing/",
      terms: "Off-peak to peak rates, in USD per million tokens.",
      uncachedInput: "$0.15–0.30",
      output: "$0.60–1.20",
      cachedInput: "$0.003–0.006",
    },
  },
  {
    id: "glm-5.3",
    upstreamIds: ["glm-5.3"],
    name: "GLM-5.3",
    brand: "glm",
    providerName: "Z.ai · Zhipu",
    profile: "zhipu",
    gatewayNote:
      "The Zhipu profile can route a Messages request through its Chat Completions endpoint. GLM-5.3 keeps reasoning enabled.",
    band: "bg-[#dea17e] dark:bg-[#593e31]",
    docs: "https://docs.z.ai/guides/llm/glm-5.3",
    tags: ["Tools", "Text"],
    description: "Agent coding with always-on reasoning.",
    inputs: "Text",
    contextWindow: "1M",
    maxOutput: "128K tokens",
    reasoning: "Always on",
    pricing: {
      url: "https://docs.z.ai/guides/overview/pricing",
      terms: "Z.ai international API rates, in USD per million tokens.",
      uncachedInput: "$1.40",
      output: "$4.40",
      cachedInput: "$0.26",
    },
  },
  {
    id: "kimi-k3",
    upstreamIds: ["kimi-k3"],
    name: "Kimi K3",
    brand: "kimi",
    providerName: "Moonshot AI",
    profile: "moonshot",
    gatewayNote:
      "The Moonshot profile supports Messages and Chat Completions. A Messages API caller can enable or disable thinking for Kimi K3.",
    band: "bg-[#e8e5db] dark:bg-[#3d3d35]",
    docs: "https://platform.kimi.ai/docs/guide/kimi-k3-quickstart",
    tags: ["Vision", "Video"],
    description: "Long-context coding with configurable reasoning.",
    inputs: "Text, images, and video",
    contextWindow: "1M",
    // https://platform.kimi.ai/docs/api/chat documents the K3 maximum after input.
    maxOutput: "Up to 1,048,576 tokens",
    reasoning: "Configurable",
    pricing: {
      url: "https://platform.kimi.ai/docs/pricing/chat",
      terms: "Standard API rates in USD per million tokens.",
      uncachedInput: "$3.00",
      output: "$15.00",
      cachedInput: "$0.30",
      cacheWrites: [
        { ttl: "5 min", price: "$3" },
        { ttl: "1 hr", price: "$6" },
      ],
    },
  },
  {
    id: "MiniMax-M3",
    upstreamIds: ["MiniMax-M3"],
    name: "MiniMax M3",
    brand: "minimax",
    providerName: "MiniMax",
    profile: "minimax",
    gatewayNote:
      "The MiniMax profile supports regional endpoints. When the gateway converts a Messages request to Chat Completions, it maps enabled thinking to MiniMax’s adaptive mode.",
    band: "bg-[#bacbc5] dark:bg-[#31443d]",
    docs: "https://github.com/MiniMax-AI/MiniMax-M3",
    tags: ["Vision", "Video"],
    description: "Multimodal coding with adaptive reasoning.",
    inputs: "Text, images, and video",
    contextWindow: "1M",
    // https://platform.minimax.io/docs/api-reference/text-chat-openai distinguishes
    // the recommended 128K output setting from the model's 512K maximum.
    maxOutput: "512K tokens",
    reasoning: "Adaptive",
    pricing: {
      url: "https://platform.minimax.io/docs/pricing/overview",
      terms:
        "Standard tier, up to 512K input tokens, in USD per million tokens. Longer inputs and Priority have separate rates.",
      uncachedInput: "$0.30",
      output: "$1.20",
      cachedInput: "$0.06",
    },
  },
];

export const providerPricesChecked = "Nov 22, 2026";

export function dashboardModelPath(model: DashboardModel) {
  return `/dashboard/models/${model.brand}`;
}

export function modelFeatures(model: DashboardModel) {
  return [
    ["Context window", `${model.contextWindow} tokens`],
    ["Max output", model.maxOutput],
    ["Input", model.inputs],
    ["Reasoning", model.reasoning],
  ];
}

export function modelPrices(model: DashboardModel) {
  return [
    ["Uncached input", model.pricing.uncachedInput],
    ["Output", model.pricing.output],
    ["Cached input", model.pricing.cachedInput],
  ];
}

export function modelPricingTerms({ pricing }: DashboardModel) {
  if (!pricing.cacheWrites?.length) return pricing.terms;
  const writes = pricing.cacheWrites
    .map(({ ttl, price }) => `${price} for ${ttl}`)
    .join(" or ");
  return `${pricing.terms} Cache writes cost ${writes}.`;
}
