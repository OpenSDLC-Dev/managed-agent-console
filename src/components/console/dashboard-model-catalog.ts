// These are upstream identifiers exercised by Platform's
// internal/modelgateway/live_test.go. An operator can give a gateway alias any name.
export interface DashboardModel {
  id: string;
  name: string;
  brand: string;
  band: string;
  docs: string;
  tags: readonly string[];
  description: string;
  inputs: string;
  maxOutput: string;
  reasoning: string;
  pricing: {
    url: string;
    terms: string;
    uncachedInput: string;
    output: string;
    cachedInput: string;
  };
}

export const dashboardModels: readonly DashboardModel[] = [
  {
    id: "deepseek-flash",
    name: "DeepSeek V4.1 Flash",
    brand: "deepseek",
    band: "bg-[#c0d8f5] dark:bg-[#283b54]",
    docs: "https://api-docs.deepseek.com/news/news261017/",
    tags: ["Reasoning", "Tool calling", "Visual input"],
    description: "Multimodal reasoning for coding and tool use.",
    inputs: "Text and images",
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
    name: "GLM-5.3",
    brand: "glm",
    band: "bg-[#dea17e] dark:bg-[#593e31]",
    docs: "https://docs.z.ai/guides/llm/glm-5.3",
    tags: ["Coding", "Agents", "Deep reasoning"],
    description: "Reasoning for software engineering and agents.",
    inputs: "Text",
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
    name: "Kimi K3",
    brand: "kimi",
    band: "bg-[#e8e5db] dark:bg-[#3d3d35]",
    docs: "https://platform.kimi.ai/docs/guide/kimi-k3-quickstart",
    tags: ["Visual reasoning", "Coding", "Knowledge work"],
    description: "Long-horizon coding, reasoning, and knowledge work.",
    inputs: "Text, images, and video",
    // https://platform.kimi.ai/docs/api/chat documents the K3 maximum after input.
    maxOutput: "Up to 1,048,576 tokens",
    reasoning: "Configurable",
    pricing: {
      url: "https://platform.kimi.ai/docs/pricing/chat",
      terms:
        "Standard API rates in USD per million tokens. Cache writes cost $3 for 5 min or $6 for 1 hr.",
      uncachedInput: "$3.00",
      output: "$15.00",
      cachedInput: "$0.30",
    },
  },
  {
    id: "MiniMax-M3",
    name: "MiniMax M3",
    brand: "minimax",
    band: "bg-[#bacbc5] dark:bg-[#31443d]",
    docs: "https://github.com/MiniMax-AI/MiniMax-M3",
    tags: ["Multimodal", "Coding", "Long context"],
    description: "A multimodal model for coding and long inputs.",
    inputs: "Text, images, and video",
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
