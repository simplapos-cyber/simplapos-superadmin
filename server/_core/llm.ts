import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  model?: string;
  thinking?: Record<string, unknown>;
  reasoning?: Record<string, unknown>;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

// ─── API routing ──────────────────────────────────────────────────────────────
// Priority: ANTHROPIC_API_KEY (direct) → Manus Forge (built-in)
const isAnthropicDirect = () => ENV.anthropicApiKey.trim().length > 0;

const resolveApiUrl = () => {
  if (isAnthropicDirect()) {
    // Anthropic's OpenAI-compatible endpoint
    return "https://api.anthropic.com/v1/messages";
  }
  return ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0
    ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`
    : "https://forge.manus.im/v1/chat/completions";
};

const resolveApiKey = () => {
  if (isAnthropicDirect()) return ENV.anthropicApiKey;
  if (ENV.forgeApiKey) return ENV.forgeApiKey;
  throw new Error("No LLM API key configured (ANTHROPIC_API_KEY or BUILT_IN_FORGE_API_KEY)");
};

// Default model when none is specified
const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_FORGE_MODEL = undefined; // Forge picks its own default

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

const RETRY_MAX_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 500;
const RETRY_MAX_DELAY_MS = 30_000;

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

const sleep = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

const parseRetryAfter = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
};

const computeBackoffDelay = (
  attempt: number,
  retryAfterMs?: number
): number => {
  const cap = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
  const jittered = cap / 2 + Math.random() * (cap / 2);
  return Math.min(Math.max(jittered, retryAfterMs ?? 0), RETRY_MAX_DELAY_MS);
};

const fetchWithBackoff = async (
  url: string,
  init: FetchInit
): Promise<Response> => {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.ok || attempt === RETRY_MAX_RETRIES) {
        return response;
      }

      const retryAfterMs = parseRetryAfter(
        response.headers.get("retry-after")
      );
      try {
        await response.body?.cancel();
      } catch {
        // Body already settled; nothing to clean up.
      }
      console.warn(
        `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after status ${response.status}`
      );
      await sleep(computeBackoffDelay(attempt, retryAfterMs));
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_MAX_RETRIES) throw error;
      console.warn(
        `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after network error`
      );
      await sleep(computeBackoffDelay(attempt));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("LLM request failed after exhausting retries");
};

// ─── Anthropic native API adapter ─────────────────────────────────────────────
/**
 * Detect the actual MIME type from the first bytes of a base64-encoded image.
 * Browsers sometimes report wrong MIME types based on file extension
 * (e.g. a JPEG file with .PNG extension → data:image/png but Anthropic rejects it).
 * We decode the first 4 bytes and check magic bytes instead.
 */
const detectMimeFromBase64 = (base64: string): string | null => {
  try {
    // Decode only the first 8 chars of base64 (= 6 bytes decoded)
    const prefix = atob ? atob(base64.substring(0, 8)) : Buffer.from(base64.substring(0, 8), 'base64').toString('binary');
    const bytes = Array.from(prefix).map(c => c.charCodeAt(0));
    // JPEG: FF D8 FF
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg';
    // PNG: 89 50 4E 47
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image/png';
    // GIF: 47 49 46
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
    // WebP: 52 49 46 46 ... 57 45 42 50
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return 'image/webp';
    return null;
  } catch {
    return null;
  }
};

// Converts OpenAI-style messages/response_format to Anthropic Messages API format
// and converts the response back to OpenAI format so callers don't need to change.

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } | { type: "url"; url: string } }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } | { type: "url"; url: string } };

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
};

const toAnthropicMessages = async (messages: Message[]): Promise<{ system: string; messages: AnthropicMessage[] }> => {
  let system = "";
  const anthropicMessages: AnthropicMessage[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      // Anthropic uses a top-level system field
      const parts = ensureArray(msg.content);
      system = parts.map(p => (typeof p === "string" ? p : (p as TextContent).text)).join("\n");
      continue;
    }

    const role = msg.role === "assistant" ? "assistant" : "user";
    const parts = ensureArray(msg.content);

    if (parts.length === 1 && typeof parts[0] === "string") {
      anthropicMessages.push({ role, content: parts[0] });
      continue;
    }

    const contentBlocks: AnthropicContentBlock[] = [];
    for (const part of parts) {
      if (typeof part === "string") {
        contentBlocks.push({ type: "text", text: part });
      } else if (part.type === "text") {
        contentBlocks.push({ type: "text", text: part.text });
      } else if (part.type === "image_url") {
        const url = part.image_url.url;
        if (url.startsWith("data:")) {
          // base64 data URL → extract media_type and data
          const match = url.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            const base64Data = match[2];
            // Detect actual MIME type from magic bytes (first 4 bytes of base64 decode)
            // This is necessary because browsers sometimes report wrong MIME types
            // (e.g., a JPEG file with .PNG extension gets data:image/png but Anthropic rejects it)
            const detectedMime = detectMimeFromBase64(base64Data) ?? match[1];
            contentBlocks.push({
              type: "image",
              source: { type: "base64", media_type: detectedMime, data: base64Data },
            });
          }
        } else {
          contentBlocks.push({
            type: "image",
            source: { type: "url", url },
          });
        }
      } else if (part.type === "file_url") {
        const fileUrl = part.file_url.url;
        const mimeType = part.file_url.mime_type ?? "application/pdf";
        if (mimeType === "application/pdf") {
          // PDFs: als document-Block senden (Anthropic unterstützt base64-PDFs)
          try {
            const fileResp = await fetch(fileUrl);
            if (fileResp.ok) {
              const arrayBuf = await fileResp.arrayBuffer();
              const base64 = Buffer.from(arrayBuf).toString("base64");
              contentBlocks.push({
                type: "document",
                source: { type: "base64", media_type: "application/pdf", data: base64 },
              } as any);
            } else {
              console.error(`[LLM] PDF download failed: ${fileResp.status}`);
            }
          } catch (e) {
            console.error("[LLM] PDF fetch error:", e);
          }
        }
      }
    }
    anthropicMessages.push({ role, content: contentBlocks });
  }

  return { system, messages: anthropicMessages };
};

const anthropicResponseToOpenAI = (raw: Record<string, unknown>, model: string): InvokeResult => {
  const content = raw.content as Array<{ type: string; text?: string }>;
  const textContent = content.filter(b => b.type === "text").map(b => b.text ?? "").join("");

  const usage = raw.usage as { input_tokens: number; output_tokens: number } | undefined;

  return {
    id: (raw.id as string) ?? "anthropic",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: textContent,
        },
        finish_reason: (raw.stop_reason as string) ?? null,
      },
    ],
    usage: usage
      ? {
          prompt_tokens: usage.input_tokens,
          completion_tokens: usage.output_tokens,
          total_tokens: usage.input_tokens + usage.output_tokens,
        }
      : undefined,
  };
};

const invokeAnthropicDirect = async (params: InvokeParams): Promise<InvokeResult> => {
  const {
    messages,
    max_tokens,
    maxTokens,
    model,
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  } = params;

  const resolvedModel = model ?? DEFAULT_ANTHROPIC_MODEL;
  const resolvedMaxTokens = max_tokens ?? maxTokens ?? 4096;

  const { system, messages: anthropicMessages } = await toAnthropicMessages(messages);

  // Build system prompt – append JSON instruction if structured output is requested
  const normalizedFormat = normalizeResponseFormat({ responseFormat, response_format, outputSchema, output_schema });
  let systemPrompt = system;
  if (normalizedFormat?.type === "json_schema" || normalizedFormat?.type === "json_object") {
    const schemaHint = normalizedFormat.type === "json_schema"
      ? `\n\nYou MUST respond with valid JSON matching this schema:\n${JSON.stringify((normalizedFormat as { type: "json_schema"; json_schema: JsonSchema }).json_schema.schema, null, 2)}\nRespond ONLY with the JSON object, no markdown, no explanation.`
      : "\n\nYou MUST respond with valid JSON only. No markdown, no explanation.";
    systemPrompt = systemPrompt ? systemPrompt + schemaHint : schemaHint;
  }

  const payload: Record<string, unknown> = {
    model: resolvedModel,
    max_tokens: resolvedMaxTokens,
    messages: anthropicMessages,
  };

  if (systemPrompt) {
    payload.system = systemPrompt;
  }

  const response = await fetchWithBackoff("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ENV.anthropicApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Anthropic LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  const raw = (await response.json()) as Record<string, unknown>;
  return anthropicResponseToOpenAI(raw, resolvedModel);
};

// ─── Forge (Manus built-in) adapter ───────────────────────────────────────────

const invokeForge = async (params: InvokeParams): Promise<InvokeResult> => {
  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    model,
    thinking,
    reasoning,
    maxTokens,
    max_tokens,
  } = params;

  if (!ENV.forgeApiKey) {
    throw new Error("No LLM API key configured (ANTHROPIC_API_KEY or BUILT_IN_FORGE_API_KEY)");
  }

  const payload: Record<string, unknown> = {
    messages: messages.map(normalizeMessage),
  };

  if (model) payload.model = model;

  if (tools && tools.length > 0) payload.tools = tools;

  const normalizedToolChoice = normalizeToolChoice(toolChoice || tool_choice, tools);
  if (normalizedToolChoice) payload.tool_choice = normalizedToolChoice;

  const resolvedMaxTokens = max_tokens ?? maxTokens;
  if (typeof resolvedMaxTokens === "number") payload.max_tokens = resolvedMaxTokens;

  if (thinking) payload.thinking = thinking;
  if (reasoning) payload.reasoning = reasoning;

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat, response_format, outputSchema, output_schema,
  });
  if (normalizedResponseFormat) payload.response_format = normalizedResponseFormat;

  const apiUrl = ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0
    ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`
    : "https://forge.manus.im/v1/chat/completions";

  const response = await fetchWithBackoff(apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.forgeApiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  return (await response.json()) as InvokeResult;
};

// ─── Public API ───────────────────────────────────────────────────────────────

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  if (isAnthropicDirect()) {
    console.log(`[LLM] Using Anthropic direct API (model: ${params.model ?? DEFAULT_ANTHROPIC_MODEL})`);
    return invokeAnthropicDirect(params);
  }
  console.log("[LLM] Using Manus Forge built-in API");
  return invokeForge(params);
}

export type ModelInfo = {
  id: string;
  object: string;
  created: number;
  owned_by: string;
};

export type ModelsResponse = {
  object: string;
  data: ModelInfo[];
};

export async function listLLMModels(): Promise<ModelsResponse> {
  if (isAnthropicDirect()) {
    // Return a static list of available Anthropic models
    return {
      object: "list",
      data: [
        { id: "claude-haiku-4-5-20251001", object: "model", created: 0, owned_by: "anthropic" },
        { id: "claude-sonnet-4-5-20250929", object: "model", created: 0, owned_by: "anthropic" },
        { id: "claude-sonnet-4-6", object: "model", created: 0, owned_by: "anthropic" },
        { id: "claude-opus-4-5-20251101", object: "model", created: 0, owned_by: "anthropic" },
      ],
    };
  }

  if (!ENV.forgeApiKey) {
    throw new Error("No LLM API key configured");
  }

  const url = ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0
    ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/models`
    : "https://forge.manus.im/v1/models";

  const response = await fetchWithBackoff(url, {
    headers: { authorization: `Bearer ${ENV.forgeApiKey}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `List LLM models failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  return (await response.json()) as ModelsResponse;
}
