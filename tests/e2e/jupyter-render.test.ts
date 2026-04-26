import {env} from 'node:process';
import {expect, test} from '@playwright/test';
import type {APIRequestContext} from '@playwright/test';
import {login, apiCreateRepo, apiDeleteRepo, assertFlushWithParent, assertNoJsError, randomString, baseUrl, apiHeaders} from './utils.ts';

// Helper to create multiple files in a single commit
async function apiCreateFiles(request: APIRequestContext, owner: string, repo: string, files: Record<string, string>) {
  const branch = 'main';

  // Get the latest commit SHA
  const branchInfo = await request.get(`${baseUrl()}/api/v1/repos/${owner}/${repo}/branches/${branch}`);
  const branchData = await branchInfo.json();
  const latestCommitSha = branchData.commit.id;

  // Create file changes
  const fileChanges = Object.entries(files).map(([path, content]) => ({
    operation: 'create',
    path,
    content: globalThis.btoa(content),
  }));

  // Create all files in one commit
  await request.post(`${baseUrl()}/api/v1/repos/${owner}/${repo}/contents`, {
    headers: apiHeaders(),
    data: {
      branch,
      files: fileChanges,
      message: 'Add test notebooks',
      sha: latestCommitSha,
    },
  });
}

test('jupyter notebook - all scenarios', async ({page, request}) => {
  test.setTimeout(25000);
  const repoName = `e2e-jupyter-all-${randomString(8)}`;
  const owner = env.GITEA_TEST_E2E_USER;

  await Promise.all([
    apiCreateRepo(request, {name: repoName}),
    login(page),
  ]);

  try {
    // Define all notebooks
    const mainNotebook = JSON.stringify({
      cells: [
        {
          cell_type: 'markdown',
          source: ['# Test Notebook\n', 'This is **markdown** with `code`.'],
        },
        {
          cell_type: 'code',
          execution_count: 1,
          source: ['print("Hello World")'],
          outputs: [{output_type: 'stream', name: 'stdout', text: ['Hello World\n']}],
        },
        {
          cell_type: 'code',
          execution_count: 2,
          source: ['import matplotlib.pyplot as plt'],
          outputs: [{
            output_type: 'execute_result',
            data: {
              'image/png': 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            },
          }],
        },
        {
          cell_type: 'code',
          execution_count: 3,
          source: ['x = 5'],
          outputs: [{
            output_type: 'execute_result',
            data: {
              'text/latex': ['$$x^2 + y^2 = z^2$$'],
              'text/plain': ['x^2 + y^2 = z^2'],
            },
          }],
        },
      ],
      metadata: {},
      nbformat: 4,
      nbformat_minor: 5,
    });

    const noOutputNotebook = JSON.stringify({
      cells: [
        {
          cell_type: 'code',
          source: ['# Code with no output'],
          outputs: [],
        },
      ],
      metadata: {},
      nbformat: 4,
      nbformat_minor: 5,
    });

    const errorNotebook = JSON.stringify({
      cells: [
        {
          cell_type: 'code',
          source: ['raise ValueError("Test error")'],
          outputs: [{
            output_type: 'error',
            ename: 'ValueError',
            evalue: 'Test error',
            traceback: ['ValueError: Test error'],
          }],
        },
      ],
      metadata: {},
      nbformat: 4,
      nbformat_minor: 5,
    });

    const mixedNotebook = JSON.stringify({
      cells: [
        {
          cell_type: 'code',
          source: ['print("text")'],
          outputs: [
            {output_type: 'stream', name: 'stdout', text: ['text\n']},
            {
              output_type: 'execute_result',
              data: {
                'text/html': ['<b>HTML output</b>'],
                'text/plain': ['HTML output'],
              },
            },
            {
              output_type: 'execute_result',
              data: {
                'image/png': 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
              },
            },
          ],
        },
      ],
      metadata: {},
      nbformat: 4,
      nbformat_minor: 5,
    });

    // Create all files in a single commit (fast, no race condition)
    await apiCreateFiles(request, owner, repoName, {
      'test.ipynb': mainNotebook,
      'no-output.ipynb': noOutputNotebook,
      'error.ipynb': errorNotebook,
      'mixed.ipynb': mixedNotebook,
    });

    // Test 1: Main notebook rendering
    await page.goto(`/${owner}/${repoName}/src/branch/main/test.ipynb`);

    let iframe = page.locator('iframe.external-render-iframe');
    await expect(iframe).toBeVisible();

    let frame = page.frameLocator('iframe.external-render-iframe');
    let viewer = frame.locator('#frontend-render-viewer');

    await Promise.all([
      expect(viewer.locator('.cell.markdown h1')).toContainText('Test Notebook'),
      expect(viewer.locator('.cell.markdown strong')).toContainText('markdown'),
      expect(viewer.locator('.cell.code .input code').first()).toContainText('print("Hello World")'),
      expect(viewer.locator('.cell.code .output pre').first()).toContainText('Hello World'),
      expect(viewer.locator('.cell.code .output img')).toBeVisible(),
      expect(viewer.locator('.cell.code .input .prompt').first()).toContainText('In [1]:'),
      expect(viewer.locator('.cell.code .output .prompt').first()).toContainText('Out[2]:'),
      expect(viewer.locator('.cell.code')).toHaveCount(3),
    ]);

    await expect.poll(async () => (await iframe.boundingBox())!.height).toBeGreaterThan(200);
    await assertFlushWithParent(iframe, page.locator('.file-view'));
    await assertNoJsError(page);

    // Test 2: No outputs
    await page.goto(`/${owner}/${repoName}/src/branch/main/no-output.ipynb`);

    iframe = page.locator('iframe.external-render-iframe');
    await expect(iframe).toBeVisible();

    frame = page.frameLocator('iframe.external-render-iframe');
    viewer = frame.locator('#frontend-render-viewer');

    await Promise.all([
      expect(viewer.locator('.cell.code')).toBeVisible(),
      expect(viewer.locator('.cell.code .output')).toBeHidden(),
    ]);
    await assertNoJsError(page);

    // Test 3: Error output
    await page.goto(`/${owner}/${repoName}/src/branch/main/error.ipynb`);

    iframe = page.locator('iframe.external-render-iframe');
    await expect(iframe).toBeVisible();

    frame = page.frameLocator('iframe.external-render-iframe');
    viewer = frame.locator('#frontend-render-viewer');

    await expect(viewer.locator('.error-output')).toContainText('ValueError: Test error');
    await assertNoJsError(page);

    // Test 4: Mixed outputs
    await page.goto(`/${owner}/${repoName}/src/branch/main/mixed.ipynb`);

    iframe = page.locator('iframe.external-render-iframe');
    await expect(iframe).toBeVisible();

    frame = page.frameLocator('iframe.external-render-iframe');
    viewer = frame.locator('#frontend-render-viewer');

    await Promise.all([
      expect(viewer.locator('.cell.code .output pre').first()).toContainText('text'),
      expect(viewer.locator('.cell.code .output b')).toContainText('HTML output'),
      expect(viewer.locator('.cell.code .output img')).toBeVisible(),
    ]);
    await assertNoJsError(page);
  } finally {
    await apiDeleteRepo(request, owner, repoName);
  }
});
