import { spawn } from 'child_process';
import * as vscode from 'vscode';

import { nixfmtExtensionId, nixfmtMarketplaceUrl } from './constants';
import { getFullRange } from './utils';

class FormatterMissingError extends Error {
  constructor(public readonly commands: string[]) {
    super(`No Nix formatter was found in PATH. Tried: ${commands.join(', ')}.`);
  }
}

export function registerFormatter(context: vscode.ExtensionContext): void {
  const formatter = vscode.languages.registerDocumentFormattingEditProvider('nix', {
    async provideDocumentFormattingEdits(document) {
      try {
        const formatted = await formatNixDocument(document);
        return [vscode.TextEdit.replace(getFullRange(document), formatted)];
      } catch (error) {
        showFormatterError(error);
        return [];
      }
    }
  });

  const formatDocument = vscode.commands.registerCommand('nixLanguageTools.formatDocument', async () => {
    await formatActiveDocument();
  });

  const installFormatter = vscode.commands.registerCommand('nixLanguageTools.installFormatter', async () => {
    await openFormatterExtensionPage();
  });

  context.subscriptions.push(formatter, formatDocument, installFormatter);
}

async function formatActiveDocument(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('Open a Nix file before formatting.');
    return;
  }

  if (editor.document.languageId !== 'nix') {
    vscode.window.showWarningMessage('Nix Forge can only format Nix documents.');
    return;
  }

  try {
    const formatted = await formatNixDocument(editor.document);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(editor.document.uri, getFullRange(editor.document), formatted);
    await vscode.workspace.applyEdit(edit);
  } catch (error) {
    showFormatterError(error);
  }
}

async function formatNixDocument(document: vscode.TextDocument): Promise<string> {
  const config = vscode.workspace.getConfiguration('nixLanguageTools');
  const configuredCommand = config.get<string>('formatter.command', 'auto').trim();
  const configuredArgs = config.get<string[]>('formatter.args', []);
  const useBuiltInFallback = config.get<boolean>('formatter.useBuiltInFallback', true);
  const text = document.getText();
  const candidates = configuredCommand === 'auto'
    ? ['nixfmt', 'nixpkgs-fmt', 'alejandra']
    : [configuredCommand];

  const availableCandidates: string[] = [];
  for (const command of candidates) {
    if (await isCommandAvailable(command)) {
      availableCandidates.push(command);
    }
  }

  if (availableCandidates.length === 0) {
    if (useBuiltInFallback) {
      return formatNixWithBuiltInFallback(text);
    }

    throw new FormatterMissingError(candidates);
  }

  const errors: string[] = [];
  for (const command of availableCandidates) {
    try {
      return await runFormatter(command, configuredArgs, text, document.uri.fsPath);
    } catch (error) {
      errors.push(`${command}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`Unable to format Nix document. Tried ${availableCandidates.join(', ')}. ${errors.join(' | ')}`);
}

function formatNixWithBuiltInFallback(input: string): string {
  const normalized = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const formattedLines: string[] = [];
  let indent = 0;
  let previousBlank = false;

  for (const rawLine of normalized.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0) {
      if (!previousBlank) {
        formattedLines.push('');
      }
      previousBlank = true;
      continue;
    }

    previousBlank = false;
    const leadingClosers = countLeadingClosingDelimiters(line);
    const lineIndent = Math.max(0, indent - leadingClosers);
    formattedLines.push(`${'  '.repeat(lineIndent)}${line}`);
    indent = Math.max(0, indent + getDelimiterDelta(line));
  }

  return `${formattedLines.join('\n').replace(/\s+$/u, '')}\n`;
}

function countLeadingClosingDelimiters(line: string): number {
  let count = 0;
  for (const character of line) {
    if (character === '}' || character === ']' || character === ')') {
      count += 1;
      continue;
    }

    break;
  }

  return count;
}

function getDelimiterDelta(line: string): number {
  let delta = 0;
  let inDoubleQuotedString = false;
  let inIndentedString = false;
  let escaping = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];

    if (!inDoubleQuotedString && !inIndentedString && character === '#') {
      break;
    }

    if (inDoubleQuotedString) {
      if (escaping) {
        escaping = false;
      } else if (character === '\\') {
        escaping = true;
      } else if (character === '"') {
        inDoubleQuotedString = false;
      }
      continue;
    }

    if (inIndentedString) {
      if (character === "'" && next === "'") {
        inIndentedString = false;
        index += 1;
      }
      continue;
    }

    if (character === '"') {
      inDoubleQuotedString = true;
      continue;
    }

    if (character === "'" && next === "'") {
      inIndentedString = true;
      index += 1;
      continue;
    }

    if (character === '{' || character === '[' || character === '(') {
      delta += 1;
    } else if (character === '}' || character === ']' || character === ')') {
      delta -= 1;
    }
  }

  return delta;
}

function runFormatter(command: string, args: string[], input: string, filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
      shell: process.platform === 'win32'
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('formatter timed out after 10 seconds'));
    }, 10_000);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout);
      } else {
        const detail = stderr.trim() || `formatter exited with code ${code}`;
        reject(new Error(`${detail} (${filePath})`));
      }
    });

    child.stdin.end(input);
  });
}

function isCommandAvailable(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (command.includes('/') || command.includes('\\')) {
      resolve(true);
      return;
    }

    const checker = process.platform === 'win32' ? 'where.exe' : 'command';
    const args = process.platform === 'win32' ? [command] : ['-v', command];
    const child = spawn(checker, args, {
      shell: process.platform !== 'win32',
      stdio: 'ignore'
    });

    child.on('error', () => {
      resolve(false);
    });
    child.on('close', (code) => {
      resolve(code === 0);
    });
  });
}

async function showFormatterError(error: unknown): Promise<void> {
  if (error instanceof FormatterMissingError) {
    const action = await vscode.window.showErrorMessage(
      'Nix Forge could not find a formatter in PATH. Install nixfmt-rfc-style, nixpkgs-fmt, or alejandra, then reload VS Code.',
      'Open formatter extension',
      'Open settings'
    );

    if (action === 'Open formatter extension') {
      await openFormatterExtensionPage();
    } else if (action === 'Open settings') {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'nixLanguageTools.formatter.command');
    }

    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  vscode.window.showErrorMessage(`Nix Forge format failed: ${message}`);
}

async function openFormatterExtensionPage(): Promise<void> {
  await openExtensionPage(nixfmtExtensionId, nixfmtMarketplaceUrl);
}

async function openExtensionPage(extensionId: string, marketplaceUrl?: string): Promise<void> {
  try {
    await vscode.env.openExternal(vscode.Uri.parse(`vscode:extension/${extensionId}`));
  } catch {
    if (marketplaceUrl) {
      await vscode.env.openExternal(vscode.Uri.parse(marketplaceUrl));
    }
  }
}
