export const modelIdPlaceholder = "${modelId}"; // Placeholder for dynamic model ID in descriptions
export function buildInitialContent(systemInstruction, userQuery) {
    return [{ role: "user", content: `${systemInstruction}\n\n${userQuery}` }];
}
// Helper to determine tools for API call
// This function's return type and logic need to be adapted for xAI's search_parameters
// For xAI, search is enabled via `search_parameters` in the chat completions request.
// Function calling is also handled differently and is not currently implemented.
// This function returns a boolean indicating if web search is needed for the xAI API call.
export function getToolsForApi(enableFunctionCalling, useWebSearch) {
    // For xAI, we primarily care if web search is requested.
    // Function calling will be handled separately if implemented.
    return useWebSearch;
}
