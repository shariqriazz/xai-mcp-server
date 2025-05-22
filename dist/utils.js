import * as path from 'node:path';
import { WORKSPACE_ROOT } from './config.js';
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
// Basic path validation
export function sanitizePath(inputPath) {
    const absolutePath = path.resolve(WORKSPACE_ROOT, inputPath);
    if (!absolutePath.startsWith(WORKSPACE_ROOT)) {
        throw new Error(`Access denied: Path is outside the workspace: ${inputPath}`);
    }
    // Basic check against path traversal
    if (absolutePath.includes('..')) {
        throw new Error(`Access denied: Invalid path component '..': ${inputPath}`);
    }
    return absolutePath;
}
