import { appConfig } from "@/lib/config";
import type { GenerationStreamSink } from "@/lib/generation-stream";
import { callStructuredModel, type StructuredModelAttemptHook } from "@/lib/openrouter";
import { safeJsonParse } from "@/lib/utils";

type JsonSchema = Record<string, unknown>;

type StreamChunk = {
  choices?: Array<{
    delta?: Record<string, unknown>;
    finish_reason?: string | null;
    message?: { content?: unknown; reasoning?: string; reasoning_details?: unknown[] };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
  error?: { message?: string };
};

function deltaTextContent(delta: Record<string, unknown>): string {
  const c = delta.content;
  if (typeof c === "string") {
    return c;
  }
  if (Array.isArray(c)) {
    return c
      .map((part) => {
        if (typeof part === "object" && part !== null && "text" in part) {
          return String((part as { text?: string }).text ?? "");
        }
        return "";
      })
      .join("");
  }
  return "";
}

function deltaReasoningText(delta: Record<string, unknown>): string {
  const r = delta.reasoning;
  if (typeof r === "string" && r.length > 0) {
    return r;
  }
  const details = delta.reasoning_details;
  if (!Array.isArray(details)) {
    return "";
  }
  return details
      .map((item) => {
        if (typeof item !== "object" || item === null) {
          return "";
        }
        const o = item as { type?: string; text?: string };
        if (o.type === "reasoning.text" && typeof o.text === "string") {
          return o.text;
        }
        if (typeof o.text === "string") {
          return o.text;
        }
        return "";
      })
      .join("");
}

async function* readSseDataLines(body: ReadableStream<Uint8Array> | null): AsyncGenerator<string> {
  if (!body) {
    return;
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data:")) {
          const data = trimmed.slice(5).trim();
          if (data === "[DONE]") {
            continue;
          }
          yield data;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const rest = buffer.trim();
  if (rest.startsWith("data:")) {
    const data = rest.slice(5).trim();
    if (data && data !== "[DONE]") {
      yield data;
    }
  }
}

/** Stream a JSON-schema completion; accumulates message text and forwards reasoning/content deltas to sink. */
export async function streamStructuredCompletion({
  model,
  instructions,
  input,
  schemaName,
  jsonSchema,
  step,
  sink,
}: {
  model: string;
  instructions: string;
  input: string;
  schemaName: string;
  jsonSchema: JsonSchema;
  step: string;
  sink?: GenerationStreamSink;
}): Promise<string> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": appConfig.openRouter.siteUrl,
      "X-Title": appConfig.openRouter.appHttpTitle,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: `${instructions}\n\nYou must respond with one valid JSON object and no surrounding prose.`,
        },
        {
          role: "user",
          content: input,
        },
      ],
      temperature: 0.35,
      stream: true,
      stream_options: { include_usage: true },
      provider: {
        require_parameters: true,
      },
      plugins: [{ id: "response-healing" }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: schemaName,
          strict: true,
          schema: jsonSchema,
        },
      },
    }),
    signal: AbortSignal.timeout(90_000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(errText || `OpenRouter stream failed: ${response.status}`);
  }

  let fullText = "";
  for await (const data of readSseDataLines(response.body)) {
    let chunk: StreamChunk;
    try {
      chunk = JSON.parse(data) as StreamChunk;
    } catch {
      continue;
    }

    if (chunk.error?.message) {
      throw new Error(chunk.error.message);
    }

    const choice = chunk.choices?.[0];
    const delta = choice?.delta;
    if (delta && typeof delta === "object") {
      const d = delta as Record<string, unknown>;
      const reason = deltaReasoningText(d);
      if (reason && sink) {
        sink({ type: "reasoning_delta", step, text: reason });
      }
      const content = deltaTextContent(d);
      if (content && sink) {
        sink({ type: "output_delta", step, text: content });
      }
      fullText += content;
    }

    if (chunk.usage && sink) {
      const u = chunk.usage;
      sink({
        type: "usage",
        step,
        model,
        promptTokens: u.prompt_tokens,
        completionTokens: u.completion_tokens,
        totalTokens: u.total_tokens,
        reasoningTokens: u.completion_tokens_details?.reasoning_tokens,
      });
    }
  }

  return fullText.trim();
}

export async function callStructuredModelStreaming<T>({
  model,
  instructions,
  input,
  schemaName,
  jsonSchema,
  step,
  sink,
  onAttempts,
}: {
  model: string;
  instructions: string;
  input: string;
  schemaName: string;
  jsonSchema: JsonSchema;
  step: string;
  sink?: GenerationStreamSink;
  onAttempts?: StructuredModelAttemptHook;
}): Promise<T | null> {
  if (!process.env.OPENROUTER_API_KEY) {
    return null;
  }

  const selectedModel = appConfig.openRouter.allowedModels.includes(model)
    ? model
    : appConfig.openRouter.model;

  let attemptIndex = 0;

  for (const modelToTry of [selectedModel, appConfig.openRouter.fallbackModel]) {
    const t0 = Date.now();
    try {
      const text = await streamStructuredCompletion({
        model: modelToTry,
        instructions,
        input,
        schemaName,
        jsonSchema,
        step,
        sink,
      });
      const parsed = safeJsonParse<T>(text);
      const ok = Boolean(parsed);
      onAttempts?.({ model: modelToTry, durationMs: Date.now() - t0, parsedOk: ok, attemptIndex });
      attemptIndex++;

      if (parsed) {
        return parsed;
      }
      console.warn(`Stream JSON parse failed for ${modelToTry}; head: ${text.slice(0, 400)}`);
    } catch (error) {
      onAttempts?.({
        model: modelToTry,
        durationMs: Date.now() - t0,
        parsedOk: false,
        attemptIndex,
      });
      attemptIndex++;

      console.warn(
        `OpenRouter stream failed for ${modelToTry}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return callStructuredModel<T>({
    model: selectedModel,
    instructions,
    input,
    schemaName,
    jsonSchema,
    onAttempts: (info) =>
      onAttempts?.({
        ...info,
        attemptIndex: attemptIndex + info.attemptIndex,
      }),
  });
}
