import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
// No longer need to explicitly remove Content, Tool imports as they were already removed.
// This file defines the core ToolDefinition interface and helpers for prompt building.

export interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: any; // Consider defining a stricter type like JSONSchema7
    buildPrompt: (args: any, modelId: string) => {
        systemInstructionText: string;
        userQueryText: string;
        useWebSearch: boolean; // Keep this to indicate if the tool *intends* to use web search
        enableFunctionCalling: boolean; // Keep this to indicate if the tool *intends* to use function calling
    };
}

export const modelIdPlaceholder = "${modelId}"; // Placeholder for dynamic model ID in descriptions

// Helper to build the initial content array
// This now returns a type compatible with xai_client.ts's CombinedContent
import { CombinedContent } from '../xai_client.js';

export function buildInitialContent(systemInstruction: string, userQuery: string): CombinedContent[] {
    return [{ role: "user", content: `${systemInstruction}\n\n${userQuery}` }];
}

// Helper to determine tools for API call
// This function's return type and logic need to be adapted for xAI's search_parameters
// For xAI, search is enabled via `search_parameters` in the chat completions request.
// Function calling is also handled differently and is not currently implemented.
// This function returns a boolean indicating if web search is needed for the xAI API call.
export function getToolsForApi(enableFunctionCalling: boolean, useWebSearch: boolean): boolean {
     // For xAI, we primarily care if web search is requested.
     // Function calling will be handled separately if implemented.
     return useWebSearch;
}