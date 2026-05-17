/**
 * Bob-powered code change analyzer
 * Processes PR context and returns structured analysis using Bob CLI
 */

import { readFile, writeFile, unlink, access } from 'fs/promises';
import { spawn } from 'child_process';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { PRContext, BobAnalysisResult } from './types';

/**
 * Validates that a parsed object matches the BobAnalysisResult schema
 * @param data - The parsed JSON object to validate
 * @returns true if valid, throws error with details if invalid
 */
function validateBobAnalysisResult(data: any): data is BobAnalysisResult {
    const errors: string[] = [];

    // Check required string fields
    if (typeof data.repo !== 'string') errors.push('repo must be a string');
    if (typeof data.pr_number !== 'number') errors.push('pr_number must be a number');
    if (typeof data.pr_title !== 'string') errors.push('pr_title must be a string');
    if (typeof data.technical_summary !== 'string') errors.push('technical_summary must be a string');

    // Check nullable string fields
    if (data.version_hint !== null && typeof data.version_hint !== 'string') {
        errors.push('version_hint must be a string or null');
    }
    if (data.breaking_change_details !== null && typeof data.breaking_change_details !== 'string') {
        errors.push('breaking_change_details must be a string or null');
    }

    // Check boolean field
    if (typeof data.breaking_changes !== 'boolean') {
        errors.push('breaking_changes must be a boolean');
    }

    // Check array fields
    if (!Array.isArray(data.change_types)) {
        errors.push('change_types must be an array');
    } else {
        const validTypes = ['feature', 'fix', 'refactor', 'chore', 'docs'];
        const invalidTypes = data.change_types.filter((t: any) => !validTypes.includes(t));
        if (invalidTypes.length > 0) {
            errors.push(`change_types contains invalid values: ${invalidTypes.join(', ')}`);
        }
    }

    if (!Array.isArray(data.affected_modules)) {
        errors.push('affected_modules must be an array');
    } else if (!data.affected_modules.every((m: any) => typeof m === 'string')) {
        errors.push('affected_modules must be an array of strings');
    }

    if (!Array.isArray(data.files_skipped)) {
        errors.push('files_skipped must be an array');
    } else if (!data.files_skipped.every((f: any) => typeof f === 'string')) {
        errors.push('files_skipped must be an array of strings');
    }

    if (errors.length > 0) {
        throw new Error(`Invalid BobAnalysisResult schema:\n${errors.map(e => `  - ${e}`).join('\n')}`);
    }

    return true;
}

/**
 * Strips markdown code blocks from content
 * Removes ```json, ```, and similar markers
 */
function stripMarkdownCodeBlocks(content: string): string {
    return content
        .replace(/^```json\s*/m, '')
        .replace(/^```\s*/m, '')
        .replace(/```$/m, '')
        .trim();
}

/**
 * Extracts the JSON output from Bob's response
 * Tries multiple strategies to find the JSON output:
 * 1. Look for content between ---output--- markers
 * 2. Look for JSON after </thinking> tag
 * 3. Search for any JSON object in the output
 *
 * All strategies strip markdown code blocks before returning
 *
 * @param bobOutput - The complete output from Bob CLI
 * @returns The extracted JSON content, trimmed of whitespace and code blocks
 * @throws Error if no valid JSON can be found
 */
function extractOutputFromBobResponse(bobOutput: string): string {
    // Strategy 1: Try ---output--- markers first
    const outputMarker = '---output---';
    const parts = bobOutput.split(outputMarker);
    
    if (parts.length >= 3) {
        // Content is between first and second marker (index 1)
        const markerContent = stripMarkdownCodeBlocks((parts[1] || '').trim());
        if (markerContent) {
            return markerContent;
        }
    }
    
    // Strategy 2: Look for content after </thinking> tag
    const thinkingEndTag = '</thinking>';
    const thinkingEndIndex = bobOutput.lastIndexOf(thinkingEndTag);
    
    if (thinkingEndIndex !== -1) {
        const afterThinking = bobOutput.substring(thinkingEndIndex + thinkingEndTag.length).trim();
        
        // Try to find JSON object in the content after </thinking>
        const jsonMatch = afterThinking.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return stripMarkdownCodeBlocks(jsonMatch[0].trim());
        }
    }
    
    // Strategy 3: Search for any JSON object in the entire output
    const jsonMatch = bobOutput.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        return stripMarkdownCodeBlocks(jsonMatch[0].trim());
    }
    
    // If we get here, no JSON was found
    throw new Error(
        `Could not extract JSON from Bob output. Tried:\n` +
        `1. Looking for ---output--- markers\n` +
        `2. Looking for JSON after </thinking> tag\n` +
        `3. Searching for any JSON object\n` +
        `Output preview: ${bobOutput.substring(0, 200)}...`
    );
}

/**
 * Executes Bob CLI with the given prompt content via stdin
 * @param promptContent - The complete prompt content to send to Bob
 * @param workingDirectory - The directory to execute Bob CLI in
 * @returns The stdout from Bob CLI
 */
async function executeBobCLI(promptContent: string, workingDirectory: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const bobProcess = spawn('bob', ['-p', '-'], {
            cwd: workingDirectory,
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';

        bobProcess.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        bobProcess.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        bobProcess.on('error', (error) => {
            reject(new Error(`Failed to execute Bob CLI: ${error.message}`));
        });

        bobProcess.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`Bob CLI exited with code ${code}. stderr: ${stderr}`));
            } else {
                resolve(stdout);
            }
        });

        // Write prompt content to stdin
        bobProcess.stdin.write(promptContent);
        bobProcess.stdin.end();
    });
}

/**
 * Runs Bob analysis on PR context data
 *
 * This function:
 * 1. Reads the Bob prompt template from src/prompts/bob-prompt.md (dev) or dist/prompts/bob-prompt.md (prod)
 * 2. Replaces {{PR_CONTEXT}} with the stringified PRContext
 * 3. Creates a temporary prompt file in the local repo
 * 4. Executes Bob CLI within the local repo directory
 * 5. Parses and validates the JSON response
 * 6. Cleans up the temporary file
 * 7. Returns the typed BobAnalysisResult
 *
 * @param prContext - The PR context data from fetchPRContext
 * @param localRepoPath - Path to the local repository where Bob will be executed
 * @returns Structured analysis result from Bob
 * @throws Error if prompt file cannot be read, Bob execution fails, or response is invalid
 */
export async function runBobAnalysis(prContext: PRContext, localRepoPath: string): Promise<BobAnalysisResult> {
    const tempPromptFile = join(localRepoPath, '.bob-prompt-temp.md');

    try {
        // Step 1: Read the Bob prompt template
        // Resolve paths relative to this module's location to support both development and production
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        
        const possiblePaths = [
            join(__dirname, '../prompts/bob-prompt.md'),      // Production: dist/bob-analyzer.js -> dist/prompts/
            join(__dirname, 'prompts/bob-prompt.md'),         // Alt production path
            join(__dirname, '../../src/prompts/bob-prompt.md'), // Development fallback
        ];
        
        let promptTemplate: string | null = null;
        let successfulPath: string | null = null;

        // Try each path until we find one that works
        for (const path of possiblePaths) {
            try {
                await access(path);
                promptTemplate = await readFile(path, 'utf-8');
                successfulPath = path;
                break;
            } catch {
                // Path doesn't exist, try next one
                continue;
            }
        }

        if (!promptTemplate || !successfulPath) {
            throw new Error(
                `Failed to read Bob prompt template. Tried paths:\n${possiblePaths.map(p => `  - ${p}`).join('\n')}`
            );
        }

        // Step 2: Replace {{PR_CONTEXT}} with the actual PR context JSON
        const prContextJson = JSON.stringify(prContext, null, 2);
        const resolvedPrompt = promptTemplate.replace('{{PR_CONTEXT}}', prContextJson);

        // Step 3: Write the resolved prompt to a temp file in the local repo
        try {
            await writeFile(tempPromptFile, resolvedPrompt, 'utf-8');
        } catch (error: any) {
            throw new Error(`Failed to write temp prompt file: ${error.message}`);
        }

        // Step 4: Execute Bob CLI within the local repo directory
        let bobOutput: string;
        try {
            bobOutput = await executeBobCLI(resolvedPrompt, localRepoPath);
        } catch (error: any) {
            throw new Error(`Bob CLI execution failed: ${error.message}`);
        }

        // Step 5: Extract output from between ---output--- markers and parse JSON
        let parsedResult: any;
        try {
            // Extract content between ---output--- markers
            const extractedOutput = extractOutputFromBobResponse(bobOutput);
            
            // Parse the extracted JSON
            parsedResult = JSON.parse(extractedOutput);
        } catch (error: any) {
            if (error.message.includes('---output---')) {
                // Error from extraction function
                throw new Error(`Failed to extract Bob output: ${error.message}`);
            }
            throw new Error(`Failed to parse Bob output as JSON: ${error.message}\nExtracted output: ${bobOutput.substring(0, 500)}...`);
        }

        // Step 6: Validate the schema
        validateBobAnalysisResult(parsedResult);

        return parsedResult as BobAnalysisResult;
    } catch (error: any) {
        // Re-throw with context
        if (error.message.includes('Bob')) {
            throw error;
        }
        throw new Error(`Bob analysis failed: ${error.message}`);
    } finally {
        // Step 7: Clean up the temp file
        try {
            await unlink(tempPromptFile);
        } catch {
            // Ignore cleanup errors
        }
    }
}

// Made with Bob