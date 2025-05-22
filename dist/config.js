// No specific SDK imports for xAI as it's OpenAI compatible
// No direct harm category imports needed as safety settings are not exposed this way
export const AI_PROVIDER = "xai"; // Hardcode to xAI
// --- xAI Specific ---
export const XAI_API_KEY = process.env.XAI_API_KEY;
export const XAI_BASE_URL = process.env.XAI_BASE_URL || "https://api.x.ai/v1";
// --- Common AI Configuration Defaults ---
const DEFAULT_XAI_MODEL_ID = "grok-3-mini"; // Default Grok model
const DEFAULT_TEMPERATURE = 0.0;
const DEFAULT_USE_STREAMING = true;
const DEFAULT_MAX_OUTPUT_TOKENS = 14661; // Max tokens for Grok 3
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;
const DEFAULT_REASONING_EFFORT = "low"; // Default to low reasoning effort
export const WORKSPACE_ROOT = process.cwd();
// --- Safety Settings (Not directly configurable via API for xAI in the same way) ---
// xAI handles safety internally. We will not expose direct safety settings here.
// If specific safety settings become available via xAI API, they would be added here.
// --- Validation ---
if (!XAI_API_KEY) {
    console.error("Error: XAI_API_KEY environment variable is not set.");
    process.exit(1);
}
// --- Shared Config Retrieval ---
export function getAIConfig() {
    // Common parameters
    let temperature = DEFAULT_TEMPERATURE;
    const tempEnv = process.env.AI_TEMPERATURE;
    if (tempEnv) {
        const parsedTemp = parseFloat(tempEnv);
        // Temperature range for xAI models is typically 0.0 to 1.0
        temperature = (!isNaN(parsedTemp) && parsedTemp >= 0.0 && parsedTemp <= 1.0) ? parsedTemp : DEFAULT_TEMPERATURE;
        if (temperature !== parsedTemp)
            console.warn(`Invalid AI_TEMPERATURE value "${tempEnv}". Using default: ${DEFAULT_TEMPERATURE}`);
    }
    let useStreaming = DEFAULT_USE_STREAMING;
    const streamEnv = process.env.AI_USE_STREAMING?.toLowerCase();
    if (streamEnv === 'false')
        useStreaming = false;
    else if (streamEnv && streamEnv !== 'true')
        console.warn(`Invalid AI_USE_STREAMING value "${streamEnv}". Using default: ${DEFAULT_USE_STREAMING}`);
    let maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS;
    const tokensEnv = process.env.AI_MAX_OUTPUT_TOKENS;
    if (tokensEnv) {
        const parsedTokens = parseInt(tokensEnv, 10);
        maxOutputTokens = (!isNaN(parsedTokens) && parsedTokens > 0) ? parsedTokens : DEFAULT_MAX_OUTPUT_TOKENS;
        if (maxOutputTokens !== parsedTokens)
            console.warn(`Invalid AI_MAX_OUTPUT_TOKENS value "${tokensEnv}". Using default: ${DEFAULT_MAX_OUTPUT_TOKENS}`);
    }
    let maxRetries = DEFAULT_MAX_RETRIES;
    const retriesEnv = process.env.AI_MAX_RETRIES;
    if (retriesEnv) {
        const parsedRetries = parseInt(retriesEnv, 10);
        maxRetries = (!isNaN(parsedRetries) && parsedRetries >= 0) ? parsedRetries : DEFAULT_MAX_RETRIES;
        if (maxRetries !== parsedRetries)
            console.warn(`Invalid AI_MAX_RETRIES value "${retriesEnv}". Using default: ${DEFAULT_MAX_RETRIES}`);
    }
    let retryDelayMs = DEFAULT_RETRY_DELAY_MS;
    const delayEnv = process.env.AI_RETRY_DELAY_MS;
    if (delayEnv) {
        const parsedDelay = parseInt(delayEnv, 10);
        retryDelayMs = (!isNaN(parsedDelay) && parsedDelay >= 0) ? parsedDelay : DEFAULT_RETRY_DELAY_MS;
        if (retryDelayMs !== parsedDelay)
            console.warn(`Invalid AI_RETRY_DELAY_MS value "${delayEnv}". Using default: ${DEFAULT_RETRY_DELAY_MS}`);
    }
    let modelId = process.env.XAI_MODEL_ID || DEFAULT_XAI_MODEL_ID; // Declare modelId here
    let reasoningEffort = DEFAULT_REASONING_EFFORT;
    const reasoningEnv = process.env.AI_REASONING_EFFORT?.toLowerCase();
    if (reasoningEnv === 'low' || reasoningEnv === 'high') {
        reasoningEffort = reasoningEnv;
    }
    else if (reasoningEnv) {
        console.warn(`Invalid AI_REASONING_EFFORT value "${reasoningEnv}". Using default: ${DEFAULT_REASONING_EFFORT}`);
    }
    return {
        provider: AI_PROVIDER,
        modelId,
        temperature,
        useStreaming,
        maxOutputTokens,
        maxRetries,
        retryDelayMs,
        reasoningEffort, // Add reasoning effort to config
        // xAI specific connection info
        xaiApiKey: XAI_API_KEY,
        xaiBaseUrl: XAI_BASE_URL
    };
}
