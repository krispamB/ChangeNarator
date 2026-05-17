/**
 * Git operations for local repository management
 */

import { spawn } from 'child_process';
import { access, constants } from 'fs/promises';
import { join } from 'path';

/**
 * Executes a git command in the specified directory
 * @param repoPath - Path to the git repository
 * @param args - Git command arguments
 * @returns stdout from the git command
 */
async function executeGitCommand(repoPath: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        const gitProcess = spawn('git', args, {
            cwd: repoPath,
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';

        gitProcess.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        gitProcess.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        gitProcess.on('error', (error) => {
            reject(new Error(`Failed to execute git command: ${error.message}`));
        });

        gitProcess.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`Git command failed with code ${code}. stderr: ${stderr}`));
            } else {
                resolve(stdout.trim());
            }
        });
    });
}

/**
 * Validates that the given path is a git repository
 * @param repoPath - Path to validate
 * @throws Error if path doesn't exist or is not a git repository
 */
async function validateGitRepository(repoPath: string): Promise<void> {
    try {
        // Check if path exists
        await access(repoPath, constants.R_OK);
    } catch {
        throw new Error(`Repository path does not exist or is not accessible: ${repoPath}`);
    }

    try {
        // Check if it's a git repository by looking for .git directory
        const gitDir = join(repoPath, '.git');
        await access(gitDir, constants.R_OK);
    } catch {
        throw new Error(`Path is not a git repository: ${repoPath}`);
    }
}

/**
 * Gets the current branch name in the local repository
 * @param localRepoPath - Path to the local git repository
 * @returns The current branch name, or null if in detached HEAD state
 * @throws Error if repository is invalid or command fails
 */
export async function getCurrentBranch(localRepoPath: string): Promise<string | null> {
    // Validate the repository
    await validateGitRepository(localRepoPath);

    try {
        // Get the current branch name
        const branchName = await executeGitCommand(localRepoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
        
        // If in detached HEAD state, git returns "HEAD"
        if (branchName === 'HEAD') {
            return null;
        }
        
        return branchName;
    } catch (error: any) {
        throw new Error(`Failed to get current branch: ${error.message}`);
    }
}

/**
 * Checks out the specified branch in the local repository
 * @param localRepoPath - Path to the local git repository
 * @param branchName - The branch name to checkout
 * @throws Error if repository is invalid or checkout fails
 */
export async function checkoutBranch(localRepoPath: string, branchName: string): Promise<void> {
    // Validate the repository
    await validateGitRepository(localRepoPath);

    try {
        console.log(`🔄 Checking out branch: ${branchName}...`);
        await executeGitCommand(localRepoPath, ['checkout', branchName]);
        console.log('✅ Successfully checked out branch');
    } catch (error: any) {
        throw new Error(`Failed to checkout branch: ${error.message}`);
    }
}

/**
 * Checks out the specified SHA in the local repository
 * @param localRepoPath - Path to the local git repository
 * @param headSHA - The commit SHA to checkout
 * @throws Error if repository is invalid or checkout fails
 */
export async function checkoutHeadSHA(localRepoPath: string, headSHA: string): Promise<void> {
    // Validate the repository
    await validateGitRepository(localRepoPath);

    try {
        // Fetch latest refs from origin to ensure we have the SHA
        console.log('📥 Fetching latest refs from origin...');
        await executeGitCommand(localRepoPath, ['fetch', 'origin']);

        // Checkout the head SHA
        console.log(`🔄 Checking out SHA: ${headSHA.substring(0, 7)}...`);
        await executeGitCommand(localRepoPath, ['checkout', headSHA]);

        console.log('✅ Successfully checked out head SHA');
    } catch (error: any) {
        throw new Error(`Failed to checkout head SHA: ${error.message}`);
    }
}

// Made with Bob