/* global console, fetch, ReadableStream, Response, TextDecoder */

import { createParser } from "eventsource-parser";

import type { ModelSpreadsheetResponse } from "./llm-manager";
import { ProviderManager } from "../provider-manager";

export type OpenRouterMessage = { role: string; content: string };

export type OpenRouterFunctionCall = {
  type: "function_call";
  id: string;
  call_id: string;
  name: "ask_clarifying_question";
  arguments: string;
};

export type OpenRouterFunctionCallOutput = {
  type: "function_call_output";
  call_id: string;
  output: string;
};

export type OpenRouterInputItem =
  | OpenRouterMessage
  | (OpenRouterFunctionCall & { content?: never })
  | (OpenRouterFunctionCallOutput & { content?: never });

export type OpenRouterOutputItem =
  | { type?: string; content?: Array<{ type?: string; text?: string }> }
  | (OpenRouterFunctionCall & { content?: never });

export type OpenRouterFunctionTool = {
  type: "function";
  name: string;
  description: string;
  strict: boolean;
  parameters: object;
};

export type OpenRouterRequestBody = {
  model: string;
  provider?: object;
  instructions: string;
  input: OpenRouterInputItem[];
  text?: object;
  max_output_tokens: number;
  reasoning?: object;
  tools?: OpenRouterFunctionTool[];
  tool_choice?: "auto" | "required";
  parallel_tool_calls?: boolean;
  max_tool_calls?: number;
  stream?: boolean;
};

export type OpenRouterResponseBody = {
  ok?: boolean;
  status?: string;
  error?: { message?: string };
  incomplete_details?: { reason?: string };
  output?: OpenRouterOutputItem[];
};

export type OpenRouterStreamEvent = {
  type?: string;
  response?: OpenRouterResponseBody;
  delta?: string;
  item?: OpenRouterOutputItem;
  item_id?: string;
  arguments?: string;
  error?: { message?: string };
  choices?: Array<{ delta?: { content?: string } }>;
};

export type OpenRouterStreamResultEvent =
  | { type: "output_text"; outputText: string }
  | { type: "complete"; response: OpenRouterResponseBody };

export class InferenceClient {
  private readonly providerManager: ProviderManager;

  constructor(providerManager: ProviderManager) {
    this.providerManager = providerManager;
  }

  async request(requestBody: OpenRouterRequestBody): Promise<OpenRouterResponseBody> {
    const requestStartTime = Date.now();
    const response = await this.sendRequestToProvider(requestBody);
    const result = await response.json();
    logInferenceResponse(result);
    console.log("Inference request duration (s):", (Date.now() - requestStartTime) / 1000);
    if (result.status === "failed") {
      throw new Error(result.error?.message || "Inference request failed.");
    } else if (result.status === "incomplete") {
      throw new Error(result.incomplete_details?.reason || "Inference response was incomplete.");
    }

    return result;
  }

  async *requestStreamEvents(
    requestBody: OpenRouterRequestBody
  ): AsyncGenerator<OpenRouterStreamResultEvent> {
    const streamingRequestBody = { ...requestBody, stream: true };
    const requestStartTime = Date.now();
    const response = await this.sendRequestToProvider(streamingRequestBody);

    for await (const event of readOpenRouterStream(response.body!)) {
      if (event.type === "complete") {
        logInferenceResponse(event.response);
        console.log("Inference request duration (s):", (Date.now() - requestStartTime) / 1000);
      }
      yield event;
    }
  }

  private async sendRequestToProvider(requestBody: OpenRouterRequestBody): Promise<Response> {
    const active = this.providerManager.getProvider();
    if (active === undefined) {
      throw new Error("Sign in before sending a request.");
    }
    logInferenceRequest(requestBody, active.displayName);
    const response = await fetch(active.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${active.keyStore.get()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (response.status === 401) {
      this.providerManager.signOut();
      throw new Error(`${active.displayName} rejected the API key.`);
    } else if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error?.message || `${active.displayName} request failed.`);
    }

    return response;
  }
}

function logInferenceRequest(requestBody: OpenRouterRequestBody, providerName: string) {
  const { instructions, input, ...requestMetadata } = requestBody;
  console.info("Inference request:", { apiProvider: providerName, ...requestMetadata });
  console.dir({ inferenceRequestInput: { input, instructions } });
}

function logInferenceResponse(responseBody: OpenRouterResponseBody) {
  const { output, ...responseMetadata } = responseBody;
  console.info("Inference response:", responseMetadata);
  console.dir({ inferenceResponseOutput: output });
}

async function* readOpenRouterStream(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<OpenRouterStreamResultEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let outputText = "";
  let functionCall: OpenRouterFunctionCall | undefined;
  let completed = false;
  let completedResponse: OpenRouterResponseBody | undefined;
  const outputTextEvents: string[] = [];
  const parser = createParser({
    onEvent(event) {
      const streamEvent = parseOpenRouterStreamEvent(event.data);
      if (!streamEvent) {
        return;
      }
      if (streamEvent.error) {
        throw new Error(streamEvent.error.message || "OpenRouter request failed.");
      }
      if (streamEvent.type === "response.failed") {
        throw new Error(streamEvent.response?.error?.message || "Inference request failed.");
      } else if (streamEvent.type === "response.incomplete") {
        throw new Error(
          streamEvent.response?.incomplete_details?.reason || "Inference response was incomplete."
        );
      } else if (streamEvent.type === "response.completed") {
        completed = true;
        completedResponse = streamEvent.response;
      }
      const textDelta = extractStreamOutputText(streamEvent);
      functionCall = updateStreamFunctionCall(functionCall, streamEvent);
      if (textDelta) {
        outputText += textDelta;
        outputTextEvents.push(outputText);
      }
    },
  });

  while (true) {
    const readResult = await reader.read();
    parser.feed(decoder.decode(readResult.value, { stream: !readResult.done }));
    while (outputTextEvents.length > 0) {
      yield { type: "output_text", outputText: outputTextEvents.shift()! };
    }

    if (readResult.done) {
      break;
    }
  }

  if (!completed) {
    throw new Error("Inference response ended before completion.");
  }

  const output: OpenRouterOutputItem[] = [
    {
      content: [{ type: "output_text", text: outputText }],
    },
  ];
  if (functionCall) {
    output.push(functionCall);
  }

  yield {
    type: "complete",
    response: completedResponse?.output ? completedResponse : { output },
  };
}

function parseOpenRouterStreamEvent(data: string) {
  if (!data || data === "[DONE]") {
    return undefined;
  }

  return JSON.parse(data) as OpenRouterStreamEvent;
}

function extractStreamOutputText(streamEvent: OpenRouterStreamEvent) {
  if (streamEvent.type === "response.output_text.delta" && streamEvent.delta) {
    return streamEvent.delta;
  }

  return streamEvent.choices?.[0]?.delta?.content || "";
}

function updateStreamFunctionCall(
  currentCall: OpenRouterFunctionCall | undefined,
  streamEvent: OpenRouterStreamEvent
): OpenRouterFunctionCall | undefined {
  if (
    (streamEvent.type === "response.output_item.added" ||
      streamEvent.type === "response.output_item.done") &&
    streamEvent.item?.type === "function_call"
  ) {
    return streamEvent.item as OpenRouterFunctionCall;
  }

  if (streamEvent.type === "response.function_call_arguments.done") {
    return {
      ...currentCall!,
      arguments: streamEvent.arguments!,
    };
  }

  return currentCall;
}

export function extractPartialMainQueryText(outputText: string) {
  const match = /"(?:answer|editExplanation)"\s*:\s*"/.exec(outputText);
  if (!match) {
    return "";
  }

  let text = "";
  let isEscaped = false;
  for (let i = match.index + match[0].length; i < outputText.length; i++) {
    const char = outputText[i];
    if (isEscaped) {
      text += char === "n" ? "\n" : char;
      isEscaped = false;
    } else if (char === "\\") {
      isEscaped = true;
    } else if (char === '"') {
      return text;
    } else {
      text += char;
    }
  }

  return text;
}

export function parseSpreadsheetResponse<T = ModelSpreadsheetResponse>(
  result: OpenRouterResponseBody
) {
  const reply = extractOpenRouterText(result);
  if (!reply) {
    throw new Error("OpenRouter response did not include output text.");
  }

  return {
    response: JSON.parse(reply) as T,
  };
}

export function extractOpenRouterText(result: OpenRouterResponseBody) {
  const parts: string[] = [];
  const output = result.output || [];

  output.forEach((item) => {
    (item.content || []).forEach((content) => {
      if (content.type === "output_text" && content.text) {
        parts.push(content.text);
      }
    });
  });

  return parts.join("\n").trim();
}
