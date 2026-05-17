/**
 * Tests for Bob analyzer module
 */

import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { runBobAnalysis } from './bob-analyzer';
import type { PRContext, BobAnalysisResult } from './types';
import * as fs from 'fs/promises';
import { spawn } from 'child_process';

// Mock modules
mock.module('fs/promises', () => ({
  readFile: mock(() => Promise.resolve('')),
  writeFile: mock(() => Promise.resolve()),
  unlink: mock(() => Promise.resolve()),
  access: mock(() => Promise.resolve()),
}));

mock.module('child_process', () => ({
  spawn: mock(() => ({})),
}));

describe('runBobAnalysis', () => {
  const mockLocalRepoPath = '/tmp/test-repo';
  
  const mockPRContext: PRContext = {
    repo: 'owner/repo',
    pr_number: 123,
    pr_title: 'Add new feature',
    base_sha: 'abc123',
    head_sha: 'def456',
    commit_messages: ['feat: add new feature', 'fix: resolve bug'],
    files_changed: [
      {
        filename: 'src/app.ts',
        status: 'modified',
        additions: 10,
        deletions: 5,
        patch: '@@ -1,5 +1,10 @@\n-old code\n+new code',
      },
      {
        filename: 'src/config.ts',
        status: 'added',
        additions: 20,
        deletions: 0,
        patch: null,
      },
    ],
    stats: {
      total_files: 2,
      total_commits: 2,
    },
  };

  const mockBobResponse: BobAnalysisResult = {
    repo: 'owner/repo',
    pr_number: 123,
    pr_title: 'Add new feature',
    version_hint: 'v1.2.0',
    change_types: ['feature', 'fix'],
    affected_modules: ['app', 'config'],
    breaking_changes: false,
    breaking_change_details: null,
    technical_summary: 'Added new feature and fixed a bug in the app module.',
    files_skipped: ['src/config.ts'],
  };

  const mockPromptTemplate = `You are a code change analyst.

{{PR_CONTEXT}}

Return JSON only.`;

  beforeEach(() => {
    // Reset mocks before each test
    mock.restore();
  });

  afterEach(() => {
    mock.restore();
  });

  test('successfully analyzes PR context', async () => {
    // Mock file read and write
    const readFileMock = mock(() => Promise.resolve(mockPromptTemplate));
    const writeFileMock = mock(() => Promise.resolve());
    const unlinkMock = mock(() => Promise.resolve());
    const accessMock = mock(() => Promise.resolve());
    mock.module('fs/promises', () => ({
      readFile: readFileMock,
      writeFile: writeFileMock,
      unlink: unlinkMock,
      access: accessMock,
    }));

    // Mock Bob CLI execution with ---output--- markers
    const mockStdout = `Thinking process here...\n---output---\n${JSON.stringify(mockBobResponse)}\n---output---`;
    const mockSpawn = mock(() => {
      const mockProcess = {
        stdout: {
          on: mock((event: string, callback: Function) => {
            if (event === 'data') {
              callback(Buffer.from(mockStdout));
            }
          }),
        },
        stderr: {
          on: mock(() => {}),
        },
        stdin: {
          write: mock(() => {}),
          end: mock(() => {}),
        },
        on: mock((event: string, callback: Function) => {
          if (event === 'close') {
            callback(0);
          }
        }),
      };
      return mockProcess;
    });

    mock.module('child_process', () => ({
      spawn: mockSpawn,
    }));

    const result = await runBobAnalysis(mockPRContext, mockLocalRepoPath);

    expect(result).toEqual(mockBobResponse);
    // The path will be resolved relative to the module location, so we just check it was called
    expect(readFileMock).toHaveBeenCalled();
    expect(mockSpawn).toHaveBeenCalledWith('bob', ['-p', '-'], {
      cwd: mockLocalRepoPath,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  });

  test('throws error when prompt file cannot be read', async () => {
    const readFileMock = mock(() => Promise.reject(new Error('File not found')));
    const writeFileMock = mock(() => Promise.resolve());
    const unlinkMock = mock(() => Promise.resolve());
    mock.module('fs/promises', () => ({
      readFile: readFileMock,
      writeFile: writeFileMock,
      unlink: unlinkMock,
    }));

    await expect(runBobAnalysis(mockPRContext, mockLocalRepoPath)).rejects.toThrow(
      'Failed to read Bob prompt template'
    );
  });

  test('throws error when Bob CLI execution fails', async () => {
    const readFileMock = mock(() => Promise.resolve(mockPromptTemplate));
    const writeFileMock = mock(() => Promise.resolve());
    const unlinkMock = mock(() => Promise.resolve());
    mock.module('fs/promises', () => ({
      readFile: readFileMock,
      writeFile: writeFileMock,
      unlink: unlinkMock,
    }));

    const mockSpawn = mock(() => {
      const mockProcess = {
        stdout: { on: mock(() => {}) },
        stderr: {
          on: mock((event: string, callback: Function) => {
            if (event === 'data') {
              callback(Buffer.from('Bob error'));
            }
          }),
        },
        stdin: {
          write: mock(() => {}),
          end: mock(() => {}),
        },
        on: mock((event: string, callback: Function) => {
          if (event === 'close') {
            callback(1); // Non-zero exit code
          }
        }),
      };
      return mockProcess;
    });

    mock.module('child_process', () => ({
      spawn: mockSpawn,
    }));

    await expect(runBobAnalysis(mockPRContext, mockLocalRepoPath)).rejects.toThrow('Bob CLI exited with code 1');
  });

  test('throws error when Bob output is missing ---output--- markers', async () => {
    const readFileMock = mock(() => Promise.resolve(mockPromptTemplate));
    const writeFileMock = mock(() => Promise.resolve());
    const unlinkMock = mock(() => Promise.resolve());
    mock.module('fs/promises', () => ({
      readFile: readFileMock,
      writeFile: writeFileMock,
      unlink: unlinkMock,
    }));

    const mockSpawn = mock(() => {
      const mockProcess = {
        stdout: {
          on: mock((event: string, callback: Function) => {
            if (event === 'data') {
              callback(Buffer.from('This output has no markers'));
            }
          }),
        },
        stderr: { on: mock(() => {}) },
        stdin: {
          write: mock(() => {}),
          end: mock(() => {}),
        },
        on: mock((event: string, callback: Function) => {
          if (event === 'close') {
            callback(0);
          }
        }),
      };
      return mockProcess;
    });

    mock.module('child_process', () => ({
      spawn: mockSpawn,
    }));

    await expect(runBobAnalysis(mockPRContext, mockLocalRepoPath)).rejects.toThrow('---output---');
  });

  test('throws error when Bob output has invalid schema', async () => {
    const readFileMock = mock(() => Promise.resolve(mockPromptTemplate));
    const writeFileMock = mock(() => Promise.resolve());
    const unlinkMock = mock(() => Promise.resolve());
    mock.module('fs/promises', () => ({
      readFile: readFileMock,
      writeFile: writeFileMock,
      unlink: unlinkMock,
    }));

    const invalidResponse = {
      repo: 'owner/repo',
      // Missing required fields
    };

    const mockStdout = `Thinking...\n---output---\n${JSON.stringify(invalidResponse)}\n---output---`;
    const mockSpawn = mock(() => {
      const mockProcess = {
        stdout: {
          on: mock((event: string, callback: Function) => {
            if (event === 'data') {
              callback(Buffer.from(mockStdout));
            }
          }),
        },
        stderr: { on: mock(() => {}) },
        stdin: {
          write: mock(() => {}),
          end: mock(() => {}),
        },
        on: mock((event: string, callback: Function) => {
          if (event === 'close') {
            callback(0);
          }
        }),
      };
      return mockProcess;
    });

    mock.module('child_process', () => ({
      spawn: mockSpawn,
    }));

    await expect(runBobAnalysis(mockPRContext, mockLocalRepoPath)).rejects.toThrow('Invalid BobAnalysisResult schema');
  });

  test('extracts JSON from Bob output between ---output--- markers', async () => {
    const readFileMock = mock(() => Promise.resolve(mockPromptTemplate));
    const writeFileMock = mock(() => Promise.resolve());
    const unlinkMock = mock(() => Promise.resolve());
    mock.module('fs/promises', () => ({
      readFile: readFileMock,
      writeFile: writeFileMock,
      unlink: unlinkMock,
    }));

    const outputWithThinking = `Here is my thinking process:
- Analyzing the PR
- Looking at changes
---output---
${JSON.stringify(mockBobResponse)}
---output---
End of response.`;

    const mockSpawn = mock(() => {
      const mockProcess = {
        stdout: {
          on: mock((event: string, callback: Function) => {
            if (event === 'data') {
              callback(Buffer.from(outputWithThinking));
            }
          }),
        },
        stderr: { on: mock(() => {}) },
        stdin: {
          write: mock(() => {}),
          end: mock(() => {}),
        },
        on: mock((event: string, callback: Function) => {
          if (event === 'close') {
            callback(0);
          }
        }),
      };
      return mockProcess;
    });

    mock.module('child_process', () => ({
      spawn: mockSpawn,
    }));

    const result = await runBobAnalysis(mockPRContext, mockLocalRepoPath);
    expect(result).toEqual(mockBobResponse);
  });

  test('validates change_types array contains only valid values', async () => {
    const readFileMock = mock(() => Promise.resolve(mockPromptTemplate));
    const writeFileMock = mock(() => Promise.resolve());
    const unlinkMock = mock(() => Promise.resolve());
    mock.module('fs/promises', () => ({
      readFile: readFileMock,
      writeFile: writeFileMock,
      unlink: unlinkMock,
    }));

    const invalidResponse = {
      ...mockBobResponse,
      change_types: ['feature', 'invalid_type'],
    };

    const mockStdout = `Thinking...\n---output---\n${JSON.stringify(invalidResponse)}\n---output---`;
    const mockSpawn = mock(() => {
      const mockProcess = {
        stdout: {
          on: mock((event: string, callback: Function) => {
            if (event === 'data') {
              callback(Buffer.from(mockStdout));
            }
          }),
        },
        stderr: { on: mock(() => {}) },
        stdin: {
          write: mock(() => {}),
          end: mock(() => {}),
        },
        on: mock((event: string, callback: Function) => {
          if (event === 'close') {
            callback(0);
          }
        }),
      };
      return mockProcess;
    });

    mock.module('child_process', () => ({
      spawn: mockSpawn,
    }));

    await expect(runBobAnalysis(mockPRContext, mockLocalRepoPath)).rejects.toThrow('invalid values');
  });

  test('replaces {{PR_CONTEXT}} placeholder correctly', async () => {
    let capturedStdin = '';
    
    const readFileMock = mock(() => Promise.resolve(mockPromptTemplate));
    const writeFileMock = mock(() => Promise.resolve());
    const unlinkMock = mock(() => Promise.resolve());
    mock.module('fs/promises', () => ({
      readFile: readFileMock,
      writeFile: writeFileMock,
      unlink: unlinkMock,
    }));

    const mockStdout = `Thinking...\n---output---\n${JSON.stringify(mockBobResponse)}\n---output---`;
    const mockSpawn = mock(() => {
      const mockProcess = {
        stdout: {
          on: mock((event: string, callback: Function) => {
            if (event === 'data') {
              callback(Buffer.from(mockStdout));
            }
          }),
        },
        stderr: { on: mock(() => {}) },
        stdin: {
          write: mock((data: string) => {
            capturedStdin += data;
          }),
          end: mock(() => {}),
        },
        on: mock((event: string, callback: Function) => {
          if (event === 'close') {
            callback(0);
          }
        }),
      };
      return mockProcess;
    });

    mock.module('child_process', () => ({
      spawn: mockSpawn,
    }));

    await runBobAnalysis(mockPRContext, mockLocalRepoPath);

    expect(capturedStdin).toContain('"repo": "owner/repo"');
    expect(capturedStdin).toContain('"pr_number": 123');
    expect(capturedStdin).not.toContain('{{PR_CONTEXT}}');
  });
});

// Made with Bob