#!/usr/bin/env node
import dotenv from 'dotenv';
import path from 'path';
// Load .env file from the current working directory (where npx/node is run)
// This ensures it works correctly when run via npx outside the project dir
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, McpError, ErrorCode, } from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import { z } from "zod"; // Needed for schema parsing within handler
import { createTwoFilesPatch } from 'diff';
import { minimatch } from 'minimatch';
import { exec } from 'child_process'; // Added for command execution
import util from 'util'; // Added for promisify
import { getAIConfig } from './config.js';
// Import CombinedContent along with callGenerativeAI
import { callGenerativeAI } from './xai_client.js';
import { allTools, toolMap } from './tools/index.js';
import { buildInitialContent } from './tools/tool_definition.js';
// Import Zod schemas from tool files for validation within the handler
import { ReadFileArgsSchema } from './tools/read_file.js';
// import { ReadMultipleFilesArgsSchema } from './tools/read_multiple_files.js'; // Removed
import { WriteFileArgsSchema } from './tools/write_file.js';
import { EditFileArgsSchema } from './tools/edit_file.js'; // Import EditOperationSchema too
// import { CreateDirectoryArgsSchema } from './tools/create_directory.js'; // Removed
import { ListDirectoryArgsSchema } from './tools/list_directory.js';
import { DirectoryTreeArgsSchema } from './tools/directory_tree.js';
import { MoveFileArgsSchema } from './tools/move_file.js';
import { SearchFilesArgsSchema } from './tools/search_files.js';
import { GetFileInfoArgsSchema } from './tools/get_file_info.js';
// Import schemas for the new combined tools
import { SaveGenerateProjectGuidelinesArgsSchema } from './tools/save_generate_project_guidelines.js';
import { SaveDocSnippetArgsSchema } from './tools/save_doc_snippet.js';
import { SaveTopicExplanationArgsSchema } from './tools/save_topic_explanation.js';
import { SaveAnswerQueryDirectArgsSchema } from './tools/save_answer_query_direct.js';
import { SaveAnswerQueryWebsearchArgsSchema } from './tools/save_answer_query_websearch.js';
import { ExecuteTerminalCommandArgsSchema } from './tools/execute_terminal_command.js'; // Renamed
// --- Filesystem Helper Functions (Adapted from example.ts) ---
// Basic security check - ensure path stays within workspace
function validateWorkspacePath(requestedPath) {
    const absolutePath = path.resolve(process.cwd(), requestedPath);
    if (!absolutePath.startsWith(process.cwd())) {
        throw new Error(`Path traversal attempt detected: ${requestedPath}`);
    }
    return absolutePath;
}
async function getFileStats(filePath) {
    const stats = await fs.stat(filePath);
    return {
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        accessed: stats.atime,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        permissions: stats.mode.toString(8).slice(-3), // POSIX permissions
    };
}
async function searchFilesRecursive(rootPath, currentPath, pattern, excludePatterns, results) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        const relativePath = path.relative(rootPath, fullPath);
        const shouldExclude = excludePatterns.some(p => minimatch(relativePath, p, { dot: true, matchBase: true }));
        if (shouldExclude) {
            continue;
        }
        if (entry.name.toLowerCase().includes(pattern.toLowerCase())) {
            results.push(path.relative(process.cwd(), fullPath));
        }
        if (entry.isDirectory()) {
            try {
                const realPath = await fs.realpath(fullPath);
                if (realPath.startsWith(rootPath)) {
                    await searchFilesRecursive(rootPath, fullPath, pattern, excludePatterns, results);
                }
            }
            catch (e) {
                console.error(`Skipping search in ${fullPath}: ${e.message}`);
            }
        }
    }
}
function normalizeLineEndings(text) {
    return text.replace(/\r\n/g, '\n');
}
function createUnifiedDiff(originalContent, newContent, filepath = 'file') {
    const normalizedOriginal = normalizeLineEndings(originalContent);
    const normalizedNew = normalizeLineEndings(newContent);
    return createTwoFilesPatch(filepath, filepath, normalizedOriginal, normalizedNew, 'original', 'modified');
}
async function applyFileEdits(filePath, edits, dryRun = false) {
    const content = normalizeLineEndings(await fs.readFile(filePath, 'utf-8'));
    let modifiedContent = content;
    for (const edit of edits) {
        const normalizedOld = normalizeLineEndings(edit.oldText);
        const normalizedNew = normalizeLineEndings(edit.newText);
        if (modifiedContent.includes(normalizedOld)) {
            modifiedContent = modifiedContent.replace(normalizedOld, normalizedNew);
            continue;
        }
        const oldLines = normalizedOld.split('\n');
        const contentLines = modifiedContent.split('\n');
        let matchFound = false;
        for (let i = 0; i <= contentLines.length - oldLines.length; i++) {
            const potentialMatch = contentLines.slice(i, i + oldLines.length);
            const isMatch = oldLines.every((oldLine, j) => oldLine.trim() === potentialMatch[j].trim());
            if (isMatch) {
                const originalIndent = contentLines[i].match(/^\s*/)?.[0] || '';
                const newLines = normalizedNew.split('\n').map((line, j) => {
                    if (j === 0)
                        return originalIndent + line.trimStart();
                    const oldIndent = oldLines[j]?.match(/^\s*/)?.[0] || '';
                    const newIndent = line.match(/^\s*/)?.[0] || '';
                    if (oldIndent && newIndent) {
                        const relativeIndent = newIndent.length - oldIndent.length;
                        return originalIndent + ' '.repeat(Math.max(0, relativeIndent)) + line.trimStart();
                    }
                    return line;
                });
                contentLines.splice(i, oldLines.length, ...newLines);
                modifiedContent = contentLines.join('\n');
                matchFound = true;
                break;
            }
        }
        if (!matchFound) {
            throw new Error(`Could not find exact or whitespace-insensitive match for edit:\n${edit.oldText}`);
        }
    }
    const diff = createUnifiedDiff(content, modifiedContent, path.relative(process.cwd(), filePath));
    if (!dryRun) {
        await fs.writeFile(filePath, modifiedContent, 'utf-8');
    }
    let numBackticks = 3;
    while (diff.includes('`'.repeat(numBackticks))) {
        numBackticks++;
    }
    return `${'`'.repeat(numBackticks)}diff\n${diff}\n${'`'.repeat(numBackticks)}`;
}
async function buildDirectoryTree(currentPath) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    const result = [];
    for (const entry of entries) {
        const entryData = {
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file'
        };
        if (entry.isDirectory()) {
            const subPath = path.join(currentPath, entry.name);
            try {
                const realPath = await fs.realpath(subPath);
                if (realPath.startsWith(path.dirname(currentPath))) {
                    entryData.children = await buildDirectoryTree(subPath);
                }
                else {
                    entryData.children = [];
                }
            }
            catch (e) {
                entryData.children = [];
                console.error(`Skipping tree build in ${subPath}: ${e.message}`);
            }
        }
        result.push(entryData);
    }
    result.sort((a, b) => {
        if (a.type === 'directory' && b.type === 'file')
            return -1;
        if (a.type === 'file' && b.type === 'directory')
            return 1;
        return a.name.localeCompare(b.name);
    });
    return result;
}
// Set of filesystem tool names for easy checking
const filesystemToolNames = new Set([
    "read_file_content", // Handles single/multiple
    // "read_multiple_files_content", // Removed
    "write_file_content", // Handles single/multiple
    "edit_file_content",
    // "create_directory", // Removed
    "list_directory_contents",
    "get_directory_tree",
    "move_file_or_directory",
    "search_filesystem",
    "get_filesystem_info",
]);
// --- MCP Server Setup ---
const server = new Server({ name: "xai-mcp-server", version: "0.1.0" }, { capabilities: { tools: {} } });
// --- Tool Definitions Handler ---
server.setRequestHandler(ListToolsRequestSchema, async () => {
    // Use new config function
    const config = getAIConfig();
    return {
        tools: allTools.map(t => ({
            name: t.name,
            // Inject model ID dynamically from new config structure
            description: t.description.replace("${modelId}", config.modelId),
            inputSchema: t.inputSchema
        }))
    };
});
// --- Tool Call Handler ---
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const args = request.params.arguments ?? {};
    const toolDefinition = toolMap.get(toolName);
    if (!toolDefinition) {
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
    }
    try {
        // --- Special Handling for Combined Tool ---
        if (toolName === "save_generate_project_guidelines") {
            const parsedArgs = SaveGenerateProjectGuidelinesArgsSchema.parse(args);
            const { tech_stack, output_path } = parsedArgs;
            // Use new config function
            const config = getAIConfig();
            const { systemInstructionText, userQueryText, useWebSearch, enableFunctionCalling } = toolDefinition.buildPrompt(args, config.modelId);
            // Use new AI function call and type cast
            const initialContents = buildInitialContent(systemInstructionText, userQueryText);
            // The useWebSearch and enableFunctionCalling are already destructured above.
            // getToolsForApi now simply returns useWebSearch, so we can use it directly.
            const generatedContent = await callGenerativeAI(initialContents, { useWebSearch } // Pass as options object
            );
            const validOutputPath = validateWorkspacePath(output_path);
            await fs.mkdir(path.dirname(validOutputPath), { recursive: true });
            await fs.writeFile(validOutputPath, generatedContent, "utf-8");
            return {
                content: [{ type: "text", text: `Successfully generated guidelines and saved to ${output_path}` }],
            };
        }
        else if (toolName === "save_doc_snippet") {
            const parsedArgs = SaveDocSnippetArgsSchema.parse(args);
            const { output_path } = parsedArgs;
            const config = getAIConfig();
            const { systemInstructionText, userQueryText, useWebSearch, enableFunctionCalling } = toolDefinition.buildPrompt(args, config.modelId);
            const initialContents = buildInitialContent(systemInstructionText, userQueryText);
            // The useWebSearch and enableFunctionCalling are already destructured above.
            const generatedContent = await callGenerativeAI(initialContents, { useWebSearch });
            const validOutputPath = validateWorkspacePath(output_path);
            await fs.mkdir(path.dirname(validOutputPath), { recursive: true });
            await fs.writeFile(validOutputPath, generatedContent, "utf-8");
            return {
                content: [{ type: "text", text: `Successfully generated snippet and saved to ${output_path}` }],
            };
        }
        else if (toolName === "save_topic_explanation") {
            const parsedArgs = SaveTopicExplanationArgsSchema.parse(args);
            const { output_path } = parsedArgs;
            const config = getAIConfig();
            const { systemInstructionText, userQueryText, useWebSearch, enableFunctionCalling } = toolDefinition.buildPrompt(args, config.modelId);
            const initialContents = buildInitialContent(systemInstructionText, userQueryText);
            // The useWebSearch and enableFunctionCalling are already destructured above.
            const generatedContent = await callGenerativeAI(initialContents, { useWebSearch });
            const validOutputPath = validateWorkspacePath(output_path);
            await fs.mkdir(path.dirname(validOutputPath), { recursive: true });
            await fs.writeFile(validOutputPath, generatedContent, "utf-8");
            return {
                content: [{ type: "text", text: `Successfully generated explanation and saved to ${output_path}` }],
            };
        }
        else if (toolName === "save_answer_query_direct") {
            const parsedArgs = SaveAnswerQueryDirectArgsSchema.parse(args);
            const { output_path } = parsedArgs;
            const config = getAIConfig();
            const { systemInstructionText, userQueryText, useWebSearch, enableFunctionCalling } = toolDefinition.buildPrompt(args, config.modelId);
            const initialContents = buildInitialContent(systemInstructionText, userQueryText);
            // The useWebSearch and enableFunctionCalling are already destructured above.
            const generatedContent = await callGenerativeAI(initialContents, { useWebSearch });
            const validOutputPath = validateWorkspacePath(output_path);
            await fs.mkdir(path.dirname(validOutputPath), { recursive: true });
            await fs.writeFile(validOutputPath, generatedContent, "utf-8");
            return {
                content: [{ type: "text", text: `Successfully generated direct answer and saved to ${output_path}` }],
            };
        }
        else if (toolName === "save_answer_query_websearch") {
            const parsedArgs = SaveAnswerQueryWebsearchArgsSchema.parse(args);
            const { output_path } = parsedArgs;
            const config = getAIConfig();
            const { systemInstructionText, userQueryText, useWebSearch, enableFunctionCalling } = toolDefinition.buildPrompt(args, config.modelId);
            const initialContents = buildInitialContent(systemInstructionText, userQueryText);
            // The useWebSearch and enableFunctionCalling are already destructured above.
            const generatedContent = await callGenerativeAI(initialContents, { useWebSearch });
            const validOutputPath = validateWorkspacePath(output_path);
            await fs.mkdir(path.dirname(validOutputPath), { recursive: true });
            await fs.writeFile(validOutputPath, generatedContent, "utf-8");
            return {
                content: [{ type: "text", text: `Successfully generated websearch answer and saved to ${output_path}` }],
            };
        } // --- Filesystem Tool Execution Logic ---
        else if (filesystemToolNames.has(toolName)) {
            let resultText = "";
            switch (toolName) {
                case "read_file_content": {
                    const parsed = ReadFileArgsSchema.parse(args);
                    if (typeof parsed.paths === 'string') {
                        // Handle single file read
                        const validPath = validateWorkspacePath(parsed.paths);
                        const content = await fs.readFile(validPath, "utf-8");
                        resultText = content;
                    }
                    else {
                        // Handle multiple file read (similar to old read_multiple_files_content)
                        const results = await Promise.all(parsed.paths.map(async (filePath) => {
                            try {
                                const validPath = validateWorkspacePath(filePath);
                                const content = await fs.readFile(validPath, "utf-8");
                                return `${path.relative(process.cwd(), validPath)}:\n${content}\n`;
                            }
                            catch (error) {
                                const errorMessage = error instanceof Error ? error.message : String(error);
                                return `${filePath}: Error - ${errorMessage}`;
                            }
                        }));
                        resultText = results.join("\n---\n");
                    }
                    break;
                }
                // case "read_multiple_files_content": // Removed - logic merged into read_file_content
                case "write_file_content": {
                    const parsed = WriteFileArgsSchema.parse(args);
                    // Access the 'writes' property which contains either a single object or an array
                    const writeOperations = Array.isArray(parsed.writes) ? parsed.writes : [parsed.writes];
                    const results = [];
                    for (const op of writeOperations) {
                        try {
                            const validPath = validateWorkspacePath(op.path);
                            await fs.mkdir(path.dirname(validPath), { recursive: true });
                            await fs.writeFile(validPath, op.content, "utf-8");
                            results.push(`Successfully wrote to ${op.path}`);
                        }
                        catch (error) {
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            results.push(`Error writing to ${op.path}: ${errorMessage}`);
                        }
                    }
                    resultText = results.join("\n");
                    break;
                }
                case "edit_file_content": {
                    const parsed = EditFileArgsSchema.parse(args);
                    if (parsed.edits.length === 0) {
                        throw new McpError(ErrorCode.InvalidParams, `'edits' array cannot be empty for ${toolName}.`);
                    }
                    const validPath = validateWorkspacePath(parsed.path);
                    resultText = await applyFileEdits(validPath, parsed.edits, parsed.dryRun);
                    break;
                }
                // case "create_directory": // Removed
                case "list_directory_contents": {
                    const parsed = ListDirectoryArgsSchema.parse(args);
                    const validPath = validateWorkspacePath(parsed.path);
                    const entries = await fs.readdir(validPath, { withFileTypes: true });
                    resultText = entries
                        .map((entry) => `${entry.isDirectory() ? "[DIR] " : "[FILE]"} ${entry.name}`)
                        .sort()
                        .join("\n");
                    if (!resultText)
                        resultText = "(Directory is empty)";
                    break;
                }
                case "get_directory_tree": {
                    const parsed = DirectoryTreeArgsSchema.parse(args);
                    const validPath = validateWorkspacePath(parsed.path);
                    const treeData = await buildDirectoryTree(validPath);
                    resultText = JSON.stringify(treeData, null, 2);
                    break;
                }
                case "move_file_or_directory": {
                    const parsed = MoveFileArgsSchema.parse(args);
                    if (parsed.source === parsed.destination) {
                        throw new McpError(ErrorCode.InvalidParams, `Source and destination paths cannot be the same for ${toolName}.`);
                    }
                    const validSourcePath = validateWorkspacePath(parsed.source);
                    const validDestPath = validateWorkspacePath(parsed.destination);
                    await fs.mkdir(path.dirname(validDestPath), { recursive: true });
                    await fs.rename(validSourcePath, validDestPath);
                    resultText = `Successfully moved ${parsed.source} to ${parsed.destination}`;
                    break;
                }
                case "search_filesystem": {
                    const parsed = SearchFilesArgsSchema.parse(args);
                    const validPath = validateWorkspacePath(parsed.path);
                    const results = [];
                    await searchFilesRecursive(validPath, validPath, parsed.pattern, parsed.excludePatterns, results);
                    resultText = results.length > 0 ? results.join("\n") : "No matches found";
                    break;
                }
                case "get_filesystem_info": {
                    const parsed = GetFileInfoArgsSchema.parse(args);
                    const validPath = validateWorkspacePath(parsed.path);
                    const info = await getFileStats(validPath);
                    resultText = `Path: ${parsed.path}\nType: ${info.isDirectory ? 'Directory' : 'File'}\nSize: ${info.size} bytes\nCreated: ${info.created.toISOString()}\nModified: ${info.modified.toISOString()}\nAccessed: ${info.accessed.toISOString()}\nPermissions: ${info.permissions}`;
                    break;
                }
                default:
                    throw new McpError(ErrorCode.MethodNotFound, `Filesystem tool handler not implemented: ${toolName}`);
            }
            // Return successful filesystem operation result
            return {
                content: [{ type: "text", text: resultText }],
            };
        }
        else if (toolName === "execute_terminal_command") { // Renamed tool name check
            const parsed = ExecuteTerminalCommandArgsSchema.parse(args); // Renamed schema
            const execPromise = util.promisify(exec);
            const options = {};
            if (parsed.cwd) {
                options.cwd = validateWorkspacePath(parsed.cwd); // Reuse validation
            }
            else {
                options.cwd = process.cwd(); // Default to workspace root
            }
            let controller;
            if (parsed.timeout) {
                controller = new AbortController();
                options.signal = controller.signal;
                options.timeout = parsed.timeout * 1000; // Convert seconds to milliseconds
            }
            try {
                // Execute the command
                const { stdout, stderr } = await execPromise(parsed.command, options);
                const output = `STDOUT:\n${stdout}\nSTDERR:\n${stderr}`;
                return {
                    content: [{ type: "text", text: output.trim() || "(No output)" }],
                };
            }
            catch (error) {
                // Handle different error types
                let errorMessage = "Command execution failed.";
                if (error.signal === 'SIGTERM' || error.code === 'ABORT_ERR') {
                    errorMessage = `Command timed out after ${parsed.timeout} seconds.`;
                }
                else if (error.stderr || error.stdout) {
                    errorMessage = `Command failed with exit code ${error.code || 'unknown'}.\nSTDOUT:\n${error.stdout}\nSTDERR:\n${error.stderr}`;
                }
                else if (error instanceof Error) {
                    errorMessage = `Command execution error: ${error.message}`;
                }
                throw new McpError(ErrorCode.InternalError, errorMessage);
            }
            finally {
                // The finally block might not be strictly necessary here as execPromise handles cleanup
                // if (controller) { controller.abort(); } // Example if manual cleanup were needed
            }
        }
        else {
            // --- Generic AI Tool Logic (Non-filesystem, non-combined) ---
            const config = getAIConfig(); // Use renamed config function
            if (!toolDefinition.buildPrompt) {
                throw new McpError(ErrorCode.MethodNotFound, `Tool ${toolName} is missing required buildPrompt logic.`);
            }
            const { systemInstructionText, userQueryText, useWebSearch, enableFunctionCalling } = toolDefinition.buildPrompt(args, config.modelId);
            const initialContents = buildInitialContent(systemInstructionText, userQueryText); // Cast
            // The useWebSearch and enableFunctionCalling are already destructured above.
            // getToolsForApi now simply returns useWebSearch, so we can use it directly.
            // Call the unified AI function
            const responseText = await callGenerativeAI(initialContents, { useWebSearch } // Pass as options object
            // Config is implicitly used by callGenerativeAI now
            );
            return {
                content: [{ type: "text", text: responseText }],
            };
        }
    }
    catch (error) {
        // Centralized error handling
        if (error instanceof z.ZodError) {
            throw new McpError(ErrorCode.InvalidParams, `Invalid arguments for ${toolName}: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
        }
        else if (error instanceof McpError) {
            throw error;
        }
        else if (error instanceof Error && error.message.includes('ENOENT')) {
            throw new McpError(ErrorCode.InvalidParams, `Path not found for tool ${toolName}: ${error.message}`);
        }
        else {
            console.error(`[${new Date().toISOString()}] Unexpected error in tool handler (${toolName}):`, error);
            throw new McpError(ErrorCode.InternalError, `Unexpected server error during ${toolName}: ${error.message || "Unknown"}`);
        }
    }
});
// --- Server Start ---
async function main() {
    const transport = new StdioServerTransport();
    console.error(`[${new Date().toISOString()}] xai-mcp-server connecting via stdio...`);
    await server.connect(transport);
    console.error(`[${new Date().toISOString()}] xai-mcp-server connected.`);
}
main().catch((error) => {
    console.error(`[${new Date().toISOString()}] Server failed to start:`, error);
    process.exit(1);
});
// --- Graceful Shutdown ---
const shutdown = async (signal) => {
    console.error(`[${new Date().toISOString()}] Received ${signal}. Shutting down server...`);
    try {
        await server.close();
        console.error(`[${new Date().toISOString()}] Server shut down gracefully.`);
        process.exit(0);
    }
    catch (shutdownError) {
        console.error(`[${new Date().toISOString()}] Error during server shutdown:`, shutdownError);
        process.exit(1);
    }
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
