# xAI MCP Server
[![smithery badge](https://smithery.ai/badge/@shariqriazz/xai-mcp-server)](https://smithery.ai/server/@shariqriazz/xai-mcp-server)

This project implements a Model Context Protocol (MCP) server that provides a comprehensive suite of tools for interacting with xAI's Grok models, focusing on coding assistance and general query answering.

<a href="https://glama.ai/mcp/servers/@shariqriazz/xai-mcp-server">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@shariqriazz/xai-mcp-server/badge" alt="xAI Server MCP server" />
</a>

## Features

*   Provides access to xAI's Grok models via numerous MCP tools.
*   Supports Live Search grounding (`answer_query_websearch`) and direct knowledge answering (`answer_query_direct`).
*   Configurable model ID, temperature, streaming behavior, max output tokens, retry settings, and reasoning effort via environment variables.
*   Uses streaming API by default for potentially better responsiveness.
*   Includes basic retry logic for transient API errors.
*   Leverages xAI's built-in safety features.

## Tools Provided

### Query & Generation (AI Focused)
*   `answer_query_websearch`: Answers a natural language query using the configured xAI model enhanced with Live Search results.
*   `answer_query_direct`: Answers a natural language query using only the internal knowledge of the configured xAI model.
*   `explain_topic_with_docs`: Provides a detailed explanation for a query about a specific software topic by synthesizing information primarily from official documentation found via Live Search.
*   `get_doc_snippets`: Provides precise, authoritative code snippets or concise answers for technical queries by searching official documentation.
*   `generate_project_guidelines`: Generates a structured project guidelines document (Markdown) based on a specified list of technologies (optionally with versions), using Live Search for best practices.

### Research & Analysis Tools
*   `code_analysis_with_docs`: Analyzes code snippets by comparing them with best practices from official documentation found via Live Search, identifying potential bugs, performance issues, and security vulnerabilities.
*   `technical_comparison`: Compares multiple technologies, frameworks, or libraries based on specific criteria, providing detailed comparison tables with pros/cons and use cases. Uses the configured xAI model with Live Search.
*   `architecture_pattern_recommendation`: Suggests architecture patterns for specific use cases based on industry best practices, with implementation examples and considerations. Uses the configured xAI model with Live Search.
*   `dependency_vulnerability_scan`: Analyzes project dependencies for known security vulnerabilities, providing detailed information and mitigation strategies. Uses the configured xAI model with Live Search.
*   `database_schema_analyzer`: Reviews database schemas for normalization, indexing, and performance issues, suggesting improvements based on database-specific best practices. Uses the configured xAI model with Live Search.
*   `security_best_practices_advisor`: Provides security recommendations for specific technologies or scenarios, with code examples for implementing secure practices. Uses the configured xAI model with Live Search.
*   `testing_strategy_generator`: Creates comprehensive testing strategies for applications or features, suggesting appropriate testing types with coverage goals. Uses the configured xAI model with Live Search.
*   `regulatory_compliance_advisor`: Provides guidance on regulatory requirements for specific industries (GDPR, HIPAA, etc.), with implementation approaches for compliance. Uses the configured xAI model with Live Search.
*   `microservice_design_assistant`: Helps design microservice architectures for specific domains, with service boundary recommendations and communication patterns. Uses the configured xAI model with Live Search.
*   `documentation_generator`: Creates comprehensive documentation for code, APIs, or systems, following industry best practices for technical documentation. Uses the configured xAI model with Live Search.

### Filesystem Operations
*   `read_file_content`: Read the complete contents of one or more files. Provide a single path string or an array of path strings.
*   `write_file_content`: Create new files or completely overwrite existing files. The 'writes' argument accepts a single object (`{path, content}`) or an array of such objects.
*   `edit_file_content`: Makes line-based edits to a text file, returning a diff preview or applying changes.
*   `list_directory_contents`: Lists files and directories directly within a specified path (non-recursive).
*   `get_directory_tree`: Gets a recursive tree view of files and directories as JSON.
*   `move_file_or_directory`: Moves or renames files and directories.
*   `search_filesystem`: Recursively searches for files/directories matching a name pattern, with optional exclusions.
*   `get_filesystem_info`: Retrieves detailed metadata (size, dates, type, permissions) about a file or directory.
*   `execute_terminal_command`: Execute a shell command, optionally specifying `cwd` and `timeout`. Returns stdout/stderr.

### Combined AI + Filesystem Operations
*   `save_generate_project_guidelines`: Generates project guidelines based on a tech stack and saves the result to a specified file path.
*   `save_doc_snippet`: Finds code snippets from documentation and saves the result to a specified file path.
*   `save_topic_explanation`: Generates a detailed explanation of a topic based on documentation and saves the result to a specified file path.
*   `save_answer_query_direct`: Answers a query using only internal knowledge and saves the answer to a specified file path.
*   `save_answer_query_websearch`: Answers a query using web search results and saves the answer to a specified file path.

*(Note: Input/output schemas for each tool are defined in their respective files within `src/tools/` and exposed via the MCP server.)*

## Prerequisites

*   Node.js (v18+)
*   Bun (`npm install -g bun`)
*   xAI Account with API access.
*   An xAI API Key.

## Setup & Installation

1.  **Clone/Place Project:** Ensure the project files are in your desired location.
2.  **Install Dependencies:**
    ```bash
    bun install
    ```
3.  **Configure Environment:**
    *   Create a `.env` file in the project root (copy `.env.example`).
    *   Set the required and optional environment variables as described in `.env.example`.
        *   `XAI_API_KEY` is required.
        *   Optionally set `XAI_MODEL_ID`, `XAI_BASE_URL`, `AI_TEMPERATURE`, `AI_USE_STREAMING`, `AI_MAX_OUTPUT_TOKENS`, `AI_MAX_RETRIES`, `AI_RETRY_DELAY_MS`, and `AI_REASONING_EFFORT`.
4.  **Build the Server:**
    ```bash
    bun run build
    ```
    This compiles the TypeScript code to `dist/index.js`.

## Usage (Standalone / NPX)

Once published to npm, you can run this server directly using `npx`:

```bash
# Ensure required environment variables are set (e.g., XAI_API_KEY)
bunx xai-mcp-server
```

Alternatively, install it globally:

```bash
bun install -g xai-mcp-server
# Then run:
xai-mcp-server
```

**Note:** Running standalone requires setting necessary environment variables (like `XAI_API_KEY`, `XAI_MODEL_ID`, etc.) in your shell environment before executing the command.

### Installing via Smithery

To install xAI MCP Server for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@shariqriazz/xai-mcp-server):

```bash
bunx -y @smithery/cli install @shariqriazz/xai-mcp-server --client claude
```

## Running with Cline

1.  **Configure MCP Settings:** Add/update the configuration in your Cline MCP settings file (e.g., `.roo/mcp.json`). You have two primary ways to configure the command:

    **Option A: Using Node (Direct Path - Recommended for Development)**

    This method uses `node` to run the compiled script directly. It's useful during development when you have the code cloned locally.

    ```json
    {
      "mcpServers": {
        "xai-mcp-server": {
          "command": "node",
          "args": [
            "/full/path/to/your/xai-mcp-server/dist/index.js" // Use absolute path or ensure it's relative to where Cline runs node
          ],
          "env": {
            // --- Required ---
            "XAI_API_KEY": "YOUR_XAI_API_KEY", // Get from xAI Console
            // --- Optional AI Parameters ---
            "XAI_MODEL_ID": "grok-3-latest", // e.g., grok-3, grok-3-fast, grok-3-mini, grok-3-mini-fast, grok-2-vision-latest
            "XAI_BASE_URL": "https://api.x.ai/v1", // Base URL for xAI API
            "AI_TEMPERATURE": "0.0",         // Range: 0.0 to 1.0
            "AI_USE_STREAMING": "true",      // Use streaming responses: "true" or "false"
            "AI_MAX_OUTPUT_TOKENS": "14661", // Max tokens in response
            "AI_MAX_RETRIES": "3",           // Number of retries on transient errors
            "AI_RETRY_DELAY_MS": "1000",     // Delay between retries in milliseconds
            "AI_REASONING_EFFORT": ""        // Optional: "low" or "high" for reasoning models. Leave empty for no reasoning.
          },
          "disabled": false,
          "alwaysAllow": [
             // Add tool names here if you don't want confirmation prompts
             // e.g., "answer_query_websearch"
          ],
          "timeout": 3600 // Optional: Timeout in seconds
        }
        // Add other servers here...
      }
    }
    ```
    *   **Important:** Ensure the `args` path points correctly to the `dist/index.js` file. Using an absolute path might be more reliable.

    **Option B: Using NPX (Requires Package Published to npm)**

    This method uses `npx` to automatically download and run the server package from the npm registry. This is convenient if you don't want to clone the repository.

    ```json
    {
      "mcpServers": {
        "xai-mcp-server": {
          "command": "bunx", // Use bunx
          "args": [
            "-y", // Auto-confirm installation
            "xai-mcp-server" // The npm package name
          ],
          "env": {
            // --- Required ---
            "XAI_API_KEY": "YOUR_XAI_API_KEY", // Get from xAI Console
            // --- Optional AI Parameters ---
            "XAI_MODEL_ID": "grok-3-latest", // e.g., grok-3, grok-3-fast, grok-3-mini, grok-3-mini-fast, grok-2-vision-latest
            "XAI_BASE_URL": "https://api.x.ai/v1", // Base URL for xAI API
            "AI_TEMPERATURE": "0.0",         // Range: 0.0 to 1.0
            "AI_USE_STREAMING": "true",      // Use streaming responses: "true" or "false"
            "AI_MAX_OUTPUT_TOKENS": "14661", // Max tokens in response
            "AI_MAX_RETRIES": "3",           // Number of retries on transient errors
            "AI_RETRY_DELAY_MS": "1000",     // Delay between retries in milliseconds
            "AI_REASONING_EFFORT": ""        // Optional: "low" or "high" for reasoning models. Leave empty for no reasoning.
          },
          "disabled": false,
          "alwaysAllow": [
             // Add tool names here if you don't want confirmation prompts
             // e.g., "answer_query_websearch"
          ],
          "timeout": 3600 // Optional: Timeout in seconds
        }
        // Add other servers here...
      }
    }
    ```
    *   Ensure the environment variables in the `env` block are correctly set, either matching `.env` or explicitly defined here. Remove comments from the actual JSON file.

2.  **Restart/Reload Cline:** Cline should detect the configuration change and start the server.

3.  **Use Tools:** You can now use the extensive list of tools via Cline.

## Development

*   **Watch Mode:** `bun run watch`
*   **Linting:** `bun run lint`
*   **Formatting:** `bun run format`
## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
