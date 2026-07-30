import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as https from 'https';

type Template = {
  label: string;
  description?: string;
  body: string;
  source?: string;
};

class FormatterMissingError extends Error {
  constructor(public readonly commands: string[]) {
    super(`No Nix formatter was found in PATH. Tried: ${commands.join(', ')}.`);
  }
}

const wikiTemplateStateKey = 'nixLanguageTools.wikiTemplates';
const wikiTemplateFirstActivationKey = 'nixLanguageTools.didFetchWikiTemplates';
const nixfmtExtensionId = 'brettm12345.nixfmt-vscode';
const nixfmtMarketplaceUrl = 'https://marketplace.visualstudio.com/items?itemName=brettm12345.nixfmt-vscode';
const nixosFormatterSnippet = 'environment.systemPackages = with pkgs; [\n  nixfmt-rfc-style\n];';
const homeManagerFormatterSnippet = 'home.packages = with pkgs; [\n  nixfmt-rfc-style\n];';

const wikiSources = [
  {
    label: 'Flakes',
    url: 'https://wiki.nixos.org/w/index.php?title=Flakes&action=raw'
  },
  {
    label: 'NixOS Modules',
    url: 'https://wiki.nixos.org/w/index.php?title=NixOS_modules&action=raw'
  },
  {
    label: 'Home Manager',
    url: 'https://wiki.nixos.org/w/index.php?title=Home_Manager&action=raw'
  }
];

const builtInTemplates: Template[] = [
  {
    label: 'Built-in: Flake',
    description: 'Basic flake.nix fallback',
    body: `{
  description = "My Nix flake";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
    in
    {
      packages.\${system}.default = pkgs.hello;
      devShells.\${system}.default = pkgs.mkShell {
        packages = with pkgs; [
          nil
          nixfmt-rfc-style
        ];
      };
    };
}
`
  },
  {
    label: 'Built-in: NixOS Module',
    description: 'NixOS configuration module fallback',
    body: `{ config, pkgs, ... }:

{
  imports = [
  ];

  environment.systemPackages = with pkgs; [
  ];

  services.openssh.enable = true;
}
`
  },
  {
    label: 'Built-in: Home Manager',
    description: 'Home Manager user config fallback',
    body: `{ config, pkgs, ... }:

{
  home.username = "your-user";
  home.homeDirectory = "/home/your-user";
  home.stateVersion = "24.05";

  programs.git = {
    enable = true;
    userName = "Your Name";
    userEmail = "you@example.com";
  };
}
`
  },
  {
    label: 'Built-in: Package Derivation',
    description: 'stdenv.mkDerivation package fallback',
    body: `{ lib, stdenv, fetchFromGitHub }:

stdenv.mkDerivation rec {
  pname = "my-package";
  version = "0.1.0";

  src = fetchFromGitHub {
    owner = "owner";
    repo = pname;
    rev = "v\${version}";
    hash = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  };

  meta = with lib; {
    description = "Package description";
    homepage = "https://example.com";
    license = licenses.mit;
    maintainers = [ ];
  };
}
`
  },
  {
    label: 'Built-in: Dev Shell',
    description: 'mkShell development environment fallback',
    body: `{ pkgs ? import <nixpkgs> { } }:

pkgs.mkShell {
  packages = with pkgs; [
    git
    nil
    nixfmt-rfc-style
  ];

  shellHook = ''
    echo "Nix dev shell ready"
  '';
}
`
  }
];

export function activate(context: vscode.ExtensionContext) {
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

  const insertTemplate = vscode.commands.registerCommand('nixLanguageTools.insertTemplate', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('Open a Nix file before inserting a template.');
      return;
    }

    const selected = await pickTemplate(context);
    if (!selected) {
      return;
    }

    await editor.edit((editBuilder) => {
      for (const selection of editor.selections) {
        editBuilder.replace(selection, selected.body);
      }
    });
  });

  const formatDocument = vscode.commands.registerCommand('nixLanguageTools.formatDocument', async () => {
    await formatActiveDocument();
  });

  const installFormatter = vscode.commands.registerCommand('nixLanguageTools.installFormatter', async () => {
    await openFormatterExtensionPage();
  });

  const copyFormatterNixosSnippet = vscode.commands.registerCommand('nixLanguageTools.copyFormatterNixosSnippet', async () => {
    await copySnippet(nixosFormatterSnippet);
  });

  const copyFormatterHomeManagerSnippet = vscode.commands.registerCommand('nixLanguageTools.copyFormatterHomeManagerSnippet', async () => {
    await copySnippet(homeManagerFormatterSnippet);
  });

  const refreshWikiTemplates = vscode.commands.registerCommand('nixLanguageTools.refreshWikiTemplates', async () => {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Refreshing Nix templates from NixOS Wiki'
      },
      async () => {
        const templates = await fetchWikiTemplates();
        await context.globalState.update(wikiTemplateStateKey, templates);
        await context.globalState.update(wikiTemplateFirstActivationKey, true);
        vscode.window.showInformationMessage(`Nix Forge refreshed ${templates.length} Wiki template(s).`);
      }
    );
  });

  context.subscriptions.push(
    formatter,
    insertTemplate,
    formatDocument,
    installFormatter,
    copyFormatterNixosSnippet,
    copyFormatterHomeManagerSnippet,
    refreshWikiTemplates
  );
  void refreshWikiTemplatesOnFirstActivation(context);
}

export function deactivate() {
}

async function pickTemplate(context: vscode.ExtensionContext): Promise<Template | undefined> {
  const config = vscode.workspace.getConfiguration('nixLanguageTools');
  const wikiTemplates = context.globalState.get<Template[]>(wikiTemplateStateKey, []);
  const customTemplates = config.get<Template[]>('templates.custom', []);
  const templates = [...wikiTemplates, ...builtInTemplates, ...customTemplates];

  const picked = await vscode.window.showQuickPick(
    templates.map((template) => ({
      label: template.label,
      description: template.description,
      detail: template.source,
      template
    })),
    {
      placeHolder: 'Choose a Nix configuration template'
    }
  );

  return picked?.template;
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

function getFullRange(document: vscode.TextDocument): vscode.Range {
  return new vscode.Range(
    document.positionAt(0),
    document.positionAt(document.getText().length)
  );
}

async function showFormatterError(error: unknown): Promise<void> {
  if (error instanceof FormatterMissingError) {
    const action = await vscode.window.showErrorMessage(
      `Nix Forge could not find a formatter in PATH. Install nixfmt-rfc-style, nixpkgs-fmt, or alejandra, then reload VS Code.`,
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

async function copySnippet(snippet: string): Promise<void> {
  await vscode.env.clipboard.writeText(snippet);
  vscode.window.showInformationMessage('Nix formatter snippet copied to clipboard.');
}

async function refreshWikiTemplatesOnFirstActivation(context: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration('nixLanguageTools');
  const shouldUpdate = config.get<boolean>('templates.updateFromWikiOnFirstActivation', true);
  const didFetch = context.globalState.get<boolean>(wikiTemplateFirstActivationKey, false);

  if (!shouldUpdate || didFetch) {
    return;
  }

  try {
    const templates = await fetchWikiTemplates();
    await context.globalState.update(wikiTemplateStateKey, templates);
  } catch {
    // Built-in templates keep the extension useful when offline or if the Wiki markup changes.
  } finally {
    await context.globalState.update(wikiTemplateFirstActivationKey, true);
  }
}

async function fetchWikiTemplates(): Promise<Template[]> {
  const templateGroups = await Promise.all(
    wikiSources.map(async (source) => {
      const raw = await fetchText(source.url);
      return extractNixTemplates(raw, source.label, source.url);
    })
  );

  return templateGroups.flat().slice(0, 20);
}

function extractNixTemplates(raw: string, label: string, source: string): Template[] {
  const blocks = [
    ...extractMatches(raw, /<syntaxhighlight[^>]*lang\s*=\s*["']?nix["']?[^>]*>([\s\S]*?)<\/syntaxhighlight>/gi),
    ...extractMatches(raw, /<syntaxHighlight[^>]*lang\s*=\s*["']?nix["']?[^>]*>([\s\S]*?)<\/syntaxHighlight>/gi),
    ...extractMatches(raw, /\{\{File\|[\s\S]*?3=<nowiki>([\s\S]*?)<\/nowiki>[\s\S]*?lang=nix[\s\S]*?\}\}/gi)
  ];

  return blocks
    .map((block) => decodeHtml(block).trim())
    .filter((block) => block.includes('{') && block.includes('}') && block.length >= 40 && block.length <= 4_000)
    .map((body, index) => ({
      label: `Wiki: ${label} ${index + 1}`,
      description: 'Fetched from the official NixOS Wiki',
      source,
      body: `${body}\n`
    }));
}

function extractMatches(input: string, pattern: RegExp): string[] {
  const matches: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(input)) !== null) {
    matches.push(match[1]);
  }

  return matches;
}

function decodeHtml(input: string): string {
  return input
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        fetchText(response.headers.location).then(resolve, reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }

      response.setEncoding('utf8');
      let data = '';
      response.on('data', (chunk) => {
        data += chunk;
      });
      response.on('end', () => {
        resolve(data);
      });
    }).on('error', reject);
  });
}
