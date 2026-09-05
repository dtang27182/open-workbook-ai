/* global console, fetch, ReadableStream, TextDecoder */

import { createParser } from "eventsource-parser";

import {
  ModelSpreadsheetResponse,
  OpenRouterFunctionCall,
  OpenRouterOutputItem,
  OpenRouterRequestBody,
  OpenRouterResponseBody,
  OpenRouterStreamResultEvent,
  OpenRouterStreamEvent,
} from "../../../../taskpane/pages/chat/chat-state-machine/chat-types";
import { OpenrouterKeyStore } from "../../openrouter-auth/openrouter-api-key";

export class OpenRouterClient {
  private readonly keyStore: OpenrouterKeyStore;

  constructor(keyStore: OpenrouterKeyStore) {
    this.keyStore = keyStore;
  }

  async request(requestBody: OpenRouterRequestBody): Promise<OpenRouterResponseBody> {
    logOpenRouterRequest(requestBody);
    const requestStartTime = Date.now();
    const response = await fetch("https://openrouter.ai/api/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.keyStore.get()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const result = await response.json();
    logOpenRouterResponse(result);
    console.log("OpenRouter request duration (s):", (Date.now() - requestStartTime) / 1000);

    if (response.status === 401) {
      this.keyStore.clear();
      throw new Error("OpenRouter rejected the API key.");
    } else if (!response.ok) {
      throw new Error(result.error?.message || "OpenRouter request failed.");
    }

    return result;
  }

  async *requestStreamEvents(
    requestBody: OpenRouterRequestBody
  ): AsyncGenerator<OpenRouterStreamResultEvent> {
    const streamingRequestBody = { ...requestBody, stream: true };
    logOpenRouterRequest(streamingRequestBody);
    const requestStartTime = Date.now();
    const response = await fetch("https://openrouter.ai/api/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.keyStore.get()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(streamingRequestBody),
    });

    if (response.status === 401) {
      this.keyStore.clear();
      throw new Error("OpenRouter rejected the API key.");
    } else if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error?.message || "OpenRouter request failed.");
    }

    for await (const event of readOpenRouterStream(response.body!)) {
      if (event.type === "complete") {
        logOpenRouterResponse(event.response);
        console.log("OpenRouter request duration (s):", (Date.now() - requestStartTime) / 1000);
      }
      yield event;
    }
  }
}

function logOpenRouterRequest(requestBody: OpenRouterRequestBody) {
  const { instructions, input, ...requestMetadata } = requestBody;
  console.info("OpenRouter request:", requestMetadata);
  console.dir({ openRouterRequestInput: { input, instructions } });
}

function logOpenRouterResponse(responseBody: OpenRouterResponseBody) {
  const { output, ...responseMetadata } = responseBody;
  console.info("OpenRouter response:", responseMetadata);
  console.dir({ openRouterResponseOutput: output });
}

async function* readOpenRouterStream(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<OpenRouterStreamResultEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let outputText = "";
  let functionCall: OpenRouterFunctionCall | undefined;
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
      outputText += extractStreamOutputText(streamEvent);
      functionCall = updateStreamFunctionCall(functionCall, streamEvent);
      if (outputText) {
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
    response: { output },
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
