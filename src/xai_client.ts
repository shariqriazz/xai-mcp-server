import OpenAI from "openai";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { getAIConfig } from './config.js';
import { sleep } from './utils.js';

// Define a union type for Content that is compatible with OpenAI's messages
// OpenAI's chat completions messages are an array of ChatCompletionMessageParam
// For simplicity, we'll use a basic structure that covers text and tool calls.
// Image content will be handled within the 'parts' array for user role.
export type CombinedContent = {
    role: "system" | "user" | "assistant" | "tool";
    content: string | Array<{ type: "text", text: string } | { type: "image_url", image_url: { url: string, detail?: "low" | "high" } }>;
    tool_call_id?: string; // For tool responses
    name?: string; // For tool responses
};

// --- Configuration and Client Initialization ---
const aiConfig = getAIConfig();
let openaiClient: OpenAI;

try {
    if (!aiConfig.xaiApiKey) {
        throw new Error("Missing XAI_API_KEY for xAI provider.");
    }
    openaiClient = new OpenAI({
        apiKey: aiConfig.xaiApiKey,
        baseURL: aiConfig.xaiBaseUrl,
    });
    console.log(`Initialized xAI client with base URL: ${aiConfig.xaiBaseUrl}`);
} catch (error: any) {
    console.error(`Error initializing xAI client:`, error.message);
    process.exit(1);
}

// --- Unified AI Call Function ---

// --- Unified AI Call Function ---
export async function callGenerativeAI(
    initialContents: CombinedContent[],
    options?: {
        useWebSearch?: boolean;
        // Add other options here if needed, e.g., specific tool calls
    }
): Promise<string> {

    const {
        modelId,
        temperature,
        useStreaming,
        maxOutputTokens,
        maxRetries,
        retryDelayMs,
        reasoningEffort, // Add reasoningEffort
    } = aiConfig;

    // Adapt initialContents to OpenAI's ChatCompletionMessageParam[]
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = initialContents.map(contentItem => {
        if (typeof contentItem.content === 'string') {
            return {
                role: contentItem.role,
                content: contentItem.content,
                tool_call_id: contentItem.tool_call_id,
                name: contentItem.name,
            } as OpenAI.Chat.Completions.ChatCompletionMessageParam;
        } else {
            // Handle array content for user role (e.g., text + image)
            return {
                role: contentItem.role,
                content: contentItem.content,
            } as OpenAI.Chat.Completions.ChatCompletionMessageParam;
        }
    });

    // Prepare search_parameters for xAI's Live Search based on options.useWebSearch
    let searchParameters: { mode: "auto" | "on" | "off", return_citations?: boolean } | undefined;
    if (options?.useWebSearch) {
        searchParameters = {
            mode: "on", // Always enable search when useWebSearch is true
            return_citations: true, // Always request citations if search is on
        };
    }

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            console.error(`[${new Date().toISOString()}] Calling xAI (${modelId}, temp: ${temperature}, live_search: ${!!searchParameters}, reasoning_effort: ${reasoningEffort || 'none'}, stream: ${useStreaming}, attempt: ${attempt + 1})`);

            let responseText: string | undefined;
            let completion: OpenAI.Chat.Completions.ChatCompletion | OpenAI.Chat.Completions.ChatCompletionChunk | undefined = undefined; // Initialize completion

            const requestParams: any = { // Use 'any' to allow xAI-specific properties
                model: modelId,
                messages: messages,
                temperature: temperature,
                max_tokens: maxOutputTokens,
                stream: useStreaming,
            };

            // Conditionally add search_parameters
            if (searchParameters) {
                requestParams.search_parameters = searchParameters;
            }
            // Conditionally add reasoning_effort only if search is NOT enabled and model supports it
            else if (reasoningEffort && modelId.startsWith("grok-3-mini")) {
                requestParams.reasoning_effort = reasoningEffort;
            }
            // No 'tools' property here for now, as xAI's search is via search_parameters
            // If actual function calling is implemented, this would be added back.

            if (useStreaming) {
                const stream = await openaiClient.chat.completions.create(requestParams as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming) as any; // Cast to any to resolve async iterator type issue
                let accumulatedText = "";
                for await (const chunk of stream) {
                    accumulatedText += chunk.choices[0]?.delta?.content || "";
                }
                responseText = accumulatedText;
            } else {
                completion = await openaiClient.chat.completions.create(requestParams as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming);
                responseText = completion.choices[0]?.message?.content || "";
            }

            if (typeof responseText === 'string' && responseText.length > 0) {
                return responseText;
            } else {
                console.error(`Empty or invalid response received from xAI. Response: ${JSON.stringify(completion || responseText, null, 2)}`);
                throw new Error(`Received empty or non-text response from xAI.`);
            }

        } catch (error: any) {
            console.error(`[${new Date().toISOString()}] Error details (attempt ${attempt + 1}):`, error);
            const errorMessageString = String(error.message || error || '').toLowerCase();
            const isBlockingError = errorMessageString.includes('blocked') || errorMessageString.includes('safety');
            const isRetryable = !isBlockingError && (
                errorMessageString.includes('429') || // Too Many Requests
                errorMessageString.includes('500') || // Internal Server Error
                errorMessageString.includes('502') || // Bad Gateway
                errorMessageString.includes('503') || // Service Unavailable
                errorMessageString.includes('504') || // Gateway Timeout
                errorMessageString.includes('network error') ||
                errorMessageString.includes('socket hang up') ||
                errorMessageString.includes('connection refused') ||
                errorMessageString.includes('timeout')
            );

            if (isRetryable && attempt < maxRetries) {
                const jitter = Math.random() * 500;
                const delay = (retryDelayMs * Math.pow(2, attempt)) + jitter;
                console.error(`[${new Date().toISOString()}] Retrying in ${delay.toFixed(0)}ms...`);
                await sleep(delay);
                continue;
            } else {
                let finalErrorMessage = `xAI API error: ${error.message || "Unknown error"}`;
                if (isBlockingError) {
                    finalErrorMessage = `Content generation blocked by xAI safety filters. (${error.message || 'No specific reason found'})`;
                } else if (error.status) { // Check for HTTP status code from OpenAI SDK error
                    finalErrorMessage = `xAI API error (Status ${error.status}): ${error.message}`;
                }
                console.error("Final error message:", finalErrorMessage);
                throw new McpError(ErrorCode.InternalError, finalErrorMessage);
            }
        }
    } // End retry loop

    throw new McpError(ErrorCode.InternalError, `Max retries (${maxRetries + 1}) reached for xAI LLM call without success.`);
}