import { appConfig } from "@/lib/config";
import { safeJsonParse } from "@/lib/utils";

export type StructuredModelAttemptHook = (info: {
  model: string;
  durationMs: number;
  parsedOk: boolean;
  attemptIndex: number;
}) => void;

type JsonSchema = Record<string, unknown>;

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: ChatContent;
    };
  }>;
  error?: {
    message?: string;
  };
};

type ChatContent = string | Array<{ type?: string; text?: string }> | undefined;

function getTextContent(content: ChatContent) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim();
  }

  return "";
}

async function requestJsonCompletion({
  model,
  instructions,
  input,
  schemaName,
  jsonSchema,
}: {
  model: string;
  instructions: string;
  input: string;
  schemaName: string;
  jsonSchema: JsonSchema;
}) {
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
  });

  const payload = (await response.json().catch(() => null)) as ChatCompletionResponse | null;

  if (!response.ok) {
    const message = payload?.error?.message ?? `OpenRouter request failed with ${response.status}`;
    throw new Error(message);
  }

  return getTextContent(payload?.choices?.[0]?.message?.content);
}

export async function callStructuredModel<T>({
  model,
  instructions,
  input,
  schemaName,
  jsonSchema,
  onAttempts,
}: {
  model: string;
  instructions: string;
  input: string;
  schemaName: string;
  jsonSchema: JsonSchema;
  onAttempts?: StructuredModelAttemptHook;
}): Promise<T | null> {
  if (!process.env.OPENROUTER_API_KEY) {
    return null;
  }

  const selectedModel = appConfig.openRouter.allowedModels.includes(model)
    ? model
    : appConfig.openRouter.model;

  const modelsToTry = [selectedModel, appConfig.openRouter.fallbackModel];
  let attemptIndex = 0;

  for (const modelToTry of modelsToTry) {
    const t0 = Date.now();
    const text = await requestJsonCompletion({
      model: modelToTry,
      instructions,
      input,
      schemaName,
      jsonSchema,
    }).catch((error) => {
      console.warn(
        `OpenRouter structured output failed for ${modelToTry}.`,
        error instanceof Error ? error.message : error,
      );
      return "";
    });
    const parsed = safeJsonParse<T>(text);
    const ok = Boolean(parsed);
    onAttempts?.({ model: modelToTry, durationMs: Date.now() - t0, parsedOk: ok, attemptIndex });
    attemptIndex++;

    if (parsed) {
      return parsed;
    } else {
      console.warn(`Failed to parse JSON for model ${modelToTry}. Raw text starts with: ${text.slice(0, 500)}`);
    }
  }

  return null;
}
