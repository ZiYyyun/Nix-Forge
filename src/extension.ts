import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as https from 'https';

type Template = {
  label: string;
  description?: string;
  body: string;
  source?: string;
};

type MirrorStatus = {
  name: string;
  url: string;
  ok: boolean;
  ms?: number;
  error?: string;
};

class FormatterMissingError extends Error {
  constructor(public readonly commands: string[]) {
    super(`No Nix formatter was found in PATH. Tried: ${commands.join(', ')}.`);
  }
}

const wikiTemplateStateKey = 'nixLanguageTools.wikiTemplates';
const wikiTemplateFirstActivationKey = 'nixLanguageTools.didFetchWikiTemplates';
const chineseMirrorStateKey = 'nixLanguageTools.chineseMirrorStatuses';
const nixfmtExtensionId = 'brettm12345.nixfmt-vscode';
const nixfmtMarketplaceUrl = 'https://marketplace.visualstudio.com/items?itemName=brettm12345.nixfmt-vscode';
const nixosFormatterSnippet = 'environment.systemPackages = with pkgs; [\n  nixfmt-rfc-style\n];';
const homeManagerFormatterSnippet = 'home.packages = with pkgs; [\n  nixfmt-rfc-style\n];';
const officialNixCacheUrl = 'https://cache.nixos.org/';
const officialNixCachePublicKey = 'cache.nixos.org-1:6NCHdD59X431o0gWypbMrAURkbJ16ZPMQFGspcDShjY=';

const chineseLanguagePackIds = [
  'MS-CEINTL.vscode-language-pack-zh-hans',
  'MS-CEINTL.vscode-language-pack-zh-hant'
];

const chineseMirrorSources = [
  'https://wiki.nixos.org/w/index.php?title=China&action=raw',
  'https://mirrors.tuna.tsinghua.edu.cn/help/nix-channels/',
  'https://mirrors.ustc.edu.cn/help/nix-channels.html'
];

const fallbackChineseMirrorUrls = [
  'https://mirrors.tuna.tsinghua.edu.cn/nix-channels/store',
  'https://mirrors.ustc.edu.cn/nix-channels/store',
  'https://mirror.sjtu.edu.cn/nix-channels/store'
];

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
    label: 'System Packages',
    description: 'Most common configuration.nix package list',
    body: `{ config, pkgs, ... }:

{
  environment.systemPackages = with pkgs; [
    # Add packages installed system-wide here.
  ];
}
`
  },
  {
    label: 'NixOS Module',
    description: 'NixOS module with imports, options, config, and meta',
    body: `{ config, lib, pkgs, ... }:

{
  # Other modules included in this evaluation.
  imports = [
    # ./hardware-configuration.nix
    # ./another-module.nix
  ];

  # Option declarations. Uncomment when this module exposes settings.
  options = {
    # services.example.enable = lib.mkEnableOption "example service";
    # services.example.package = lib.mkPackageOption pkgs "hello" { };
  };

  # Option definitions. Put the actual system configuration here.
  config = {
    environment.systemPackages = with pkgs; [
      # hello
    ];

    # services.openssh.enable = true;
  };

  meta = {
    # maintainers = with lib.maintainers; [ ];
  };
}
`
  },
  {
    label: 'Flake',
    description: 'flake.nix with inputs, packages, and devShell',
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
    label: 'Home Manager',
    description: 'Home Manager user configuration',
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
    label: 'Dotfiles',
    description: 'Manage dotfiles with Home Manager',
    body: `{ config, pkgs, ... }:

{
  home.username = "your-user";
  home.homeDirectory = "/home/your-user";
  home.stateVersion = "24.05";

  # Link an existing file from this repository into your home directory.
  home.file.".gitconfig".source = ./dotfiles/gitconfig;

  # Generate a small dotfile directly from Nix.
  home.file.".config/example/config.toml".text = ''
    theme = "dark"
    editor = "nvim"
  '';

  # XDG config files usually belong under ~/.config.
  xdg.configFile."nvim/init.lua".source = ./dotfiles/nvim/init.lua;
  xdg.configFile."starship.toml".source = ./dotfiles/starship.toml;

  programs.git = {
    enable = true;
    userName = "Your Name";
    userEmail = "you@example.com";
  };
}
`
  },
  {
    label: 'Package Builder',
    description: 'Build a package with stdenv.mkDerivation',
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
    label: 'Dev Shell',
    description: 'Development environment with mkShell',
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

    if (editor.document.languageId !== 'nix') {
      vscode.window.showWarningMessage('Nix Forge templates can only be inserted into Nix files.');
      return;
    }

    const selected = await pickTemplate(context);
    if (!selected) {
      return;
    }

    const body = await buildTemplateBody(context, selected);
    await editor.edit((editBuilder) => {
      for (const selection of editor.selections) {
        editBuilder.replace(selection, body);
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
  void refreshChineseMirrorStatuses(context);
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

async function buildTemplateBody(context: vscode.ExtensionContext, template: Template): Promise<string> {
  const hasChineseLanguagePack = isChineseLanguagePackInstalled();
  const mirrorStatuses = hasChineseLanguagePack ? await getChineseMirrorStatuses(context) : [];
  const helpLines = getTemplateHelpLines(template, hasChineseLanguagePack);
  const helpBlock = helpLines.map((line) => `# ${line}`).join('\n');
  const body = hasChineseLanguagePack
    ? applyChineseTemplateEnhancements(template, template.body, mirrorStatuses)
    : template.body;

  return `${helpBlock}\n\n${body}`;
}

function isChineseLanguagePackInstalled(): boolean {
  return chineseLanguagePackIds.some((id) => vscode.extensions.getExtension(id) !== undefined);
}

async function getChineseMirrorStatuses(context: vscode.ExtensionContext): Promise<MirrorStatus[]> {
  const cached = context.globalState.get<MirrorStatus[]>(chineseMirrorStateKey, []);
  if (cached.length > 0) {
    return cached;
  }

  try {
    const fetched = await fetchChineseMirrorStatuses();
    await context.globalState.update(chineseMirrorStateKey, fetched);
    return fetched;
  } catch {
    return fallbackChineseMirrorUrls.map((url) => ({
      name: getMirrorName(url),
      url,
      ok: false,
      error: 'not tested'
    }));
  }
}

function getTemplateHelpLines(template: Template, hasChineseLanguagePack: boolean): string[] {
  const label = template.label.replace(/^Built-in:\s*/u, '').replace(/^Wiki:\s*/u, '');

  if (!hasChineseLanguagePack) {
    return [
      `Nix Forge template: ${label}.`,
      'Replace placeholder names, paths, packages, system values, hashes, and URLs before use.',
      'For exact formatting, install nixfmt-rfc-style, nixpkgs-fmt, or alejandra in your Nix environment.'
    ];
  }

  const lines = [
    `Nix Forge \u6a21\u677f\uff1a${label}`,
    ...getChineseTemplateUsageLines(template),
    'NixOS \u6362\u6e90\u5199\u5728 nix.settings.substituters\uff1b\u72ec\u7acb Nix \u5199\u5728 /etc/nix/nix.conf \u6216 ~/.config/nix/nix.conf \u7684 substituters\u3002'
  ];

  if (template.label.includes('Flake')) {
    lines.push('Flake \u7684 nixpkgs \u8f93\u5165\u5728 inputs.nixpkgs.url \u91cc\u6539\uff1b\u4e8c\u8fdb\u5236\u7f13\u5b58\u6e90\u5728 nixConfig.substituters \u91cc\u6539\u3002');
  }

  return lines;
}

function getChineseTemplateUsageLines(template: Template): string[] {
  if (template.label.includes('System Packages')) {
    return [
      '\u8fd9\u662f\u6700\u5e38\u7528\u7684 configuration.nix \u6a21\u677f\uff0c\u628a\u8981\u5168\u5c40\u5b89\u88c5\u7684\u8f6f\u4ef6\u5199\u8fdb environment.systemPackages\u3002',
      '\u6bcf\u4e2a\u5305\u540d\u901a\u5e38\u76f4\u63a5\u5199\u6210 pkgs.xxx\uff0c\u4e5f\u53ef\u4ee5\u7ee7\u7eed\u4f7f\u7528 with pkgs \u8bed\u6cd5\u3002'
    ];
  }

  if (template.label.includes('Flake')) {
    return [
      '\u628a description \u6539\u6210\u9879\u76ee\u8bf4\u660e\uff0c\u628a system \u6539\u6210\u4f60\u7684\u5e73\u53f0\uff0c\u4f8b\u5982 x86_64-linux \u6216 aarch64-linux\u3002',
      '\u5728 packages/devShells \u91cc\u66ff\u6362\u9ed8\u8ba4\u5305\u548c\u5f00\u53d1\u5de5\u5177\u3002'
    ];
  }

  if (template.label.includes('NixOS Module')) {
    return [
      '\u8fd9\u662f\u5b98\u65b9 NixOS module \u7ed3\u6784\uff1aimports \u5f15\u5165\u6a21\u5757\uff0coptions \u58f0\u660e\u53ef\u914d\u7f6e\u9879\uff0cconfig \u5199\u5b9e\u9645\u914d\u7f6e\uff0cmeta \u5199\u7ef4\u62a4\u4fe1\u606f\u3002',
      '\u5982\u679c\u53ea\u662f\u666e\u901a configuration.nix\uff0c\u53ef\u4ee5\u4fdd\u7559 config \u91cc\u7684\u914d\u7f6e\uff0c\u628a\u6682\u65f6\u4e0d\u7528\u7684 options/meta \u793a\u4f8b\u7ee7\u7eed\u6ce8\u91ca\u6389\u3002'
    ];
  }

  if (template.label.includes('Home Manager')) {
    return [
      '\u628a username\u3001homeDirectory \u548c stateVersion \u6539\u6210\u4f60\u7684\u5b9e\u9645\u7528\u6237\u914d\u7f6e\u3002',
      '\u5e38\u7528\u8f6f\u4ef6\u5199\u5728 home.packages\uff0c\u7a0b\u5e8f\u914d\u7f6e\u5199\u5728 programs.*\u3002'
    ];
  }

  if (template.label.includes('Dotfiles')) {
    return [
      '\u7528 Home Manager \u58f0\u660e\u5f0f\u7ba1\u7406 dotfiles\uff1ahome.file \u9002\u5408\u653e\u5230\u4e3b\u76ee\u5f55\uff0cxdg.configFile \u9002\u5408\u653e\u5230 ~/.config\u3002',
      'source \u7528\u6765\u94fe\u63a5\u4ed3\u5e93\u91cc\u7684\u6587\u4ef6\uff0ctext \u7528\u6765\u76f4\u63a5\u751f\u6210\u5c0f\u914d\u7f6e\u6587\u4ef6\u3002'
    ];
  }

  if (template.label.includes('Package Builder')) {
    return [
      '\u628a pname\u3001version\u3001src\u3001hash \u548c meta \u6539\u6210\u76ee\u6807\u8f6f\u4ef6\u5305\u7684\u4fe1\u606f\u3002',
      'hash \u53ef\u4ee5\u5148\u7559\u7a7a\u6784\u5efa\u4e00\u6b21\uff0c\u518d\u7528 Nix \u7ed9\u51fa\u7684\u6b63\u786e sha256 \u66ff\u6362\u3002'
    ];
  }

  if (template.label.includes('Dev Shell')) {
    return [
      '\u628a packages \u6539\u6210\u9879\u76ee\u9700\u8981\u7684\u547d\u4ee4\u884c\u5de5\u5177\u548c\u4f9d\u8d56\u3002',
      'shellHook \u9002\u5408\u653e\u8fdb\u5165\u5f00\u53d1\u73af\u5883\u65f6\u8981\u6267\u884c\u7684\u8f7b\u91cf\u63d0\u793a\u6216\u73af\u5883\u53d8\u91cf\u3002'
    ];
  }

  return [
    '\u6839\u636e\u5f53\u524d\u6587\u4ef6\u7528\u9014\u66ff\u6362\u5360\u4f4d\u7b26\u3001\u8def\u5f84\u3001\u5305\u540d\u3001\u7248\u672c\u53f7\u548c hash\u3002',
    '\u63d2\u5165\u540e\u5efa\u8bae\u8fd0\u884c\u683c\u5f0f\u5316\u5e76\u68c0\u67e5 Nix \u8bed\u6cd5\u3002'
  ];
}

function applyChineseTemplateEnhancements(template: Template, body: string, mirrors: MirrorStatus[]): string {
  if (template.label.includes('System Packages')) {
    return body.replace('{\n', `{\n${buildNixosMirrorBlock(mirrors, 2)}\n`);
  }

  if (template.label.includes('NixOS Module')) {
    return body.replace('  config = {\n', `  config = {\n${buildNixosMirrorBlock(mirrors, 4)}\n`);
  }

  if (template.label.includes('Flake')) {
    return body.replace('  inputs = {\n', `${buildFlakeMirrorBlock(mirrors, 2)}\n\n  inputs = {\n`);
  }

  return body;
}

function buildNixosMirrorBlock(mirrors: MirrorStatus[], indent: number): string {
  return `${' '.repeat(indent)}nix.settings = {
${buildSubstitutersBlock(mirrors, indent + 2)}

${' '.repeat(indent + 2)}# cache.nixos.org \u5b98\u65b9\u7f13\u5b58\u7684\u516c\u94a5\uff1b\u5982\u679c\u53ea\u7528\u5b98\u65b9\u548c\u5176\u540c\u6b65\u955c\u50cf\uff0c\u8fd9\u4e00\u884c\u4e0d\u8981\u5220\u3002
${' '.repeat(indent + 2)}trusted-public-keys = [
${' '.repeat(indent + 4)}"${officialNixCachePublicKey}"
${' '.repeat(indent + 2)}];
${' '.repeat(indent)}};`;
}

function buildFlakeMirrorBlock(mirrors: MirrorStatus[], indent: number): string {
  return `${' '.repeat(indent)}nixConfig = {
${buildSubstitutersBlock(mirrors, indent + 2)}

${' '.repeat(indent + 2)}extra-trusted-public-keys = [
${' '.repeat(indent + 4)}"${officialNixCachePublicKey}"
${' '.repeat(indent + 2)}];
${' '.repeat(indent)}};`;
}

function buildSubstitutersBlock(mirrors: MirrorStatus[], indent: number): string {
  const best = mirrors
    .filter((mirror) => mirror.ok && typeof mirror.ms === 'number')
    .sort((left, right) => (left.ms ?? Number.MAX_SAFE_INTEGER) - (right.ms ?? Number.MAX_SAFE_INTEGER))[0];
  const activeMirror = best?.url;
  const lines = [
    `${' '.repeat(indent)}# Nix Forge \u5df2\u5c1d\u8bd5\u6d4b\u901f\u4ee5\u4e0b\u56fd\u5185\u7f13\u5b58\u6e90\uff1b\u5019\u9009\u9879\u4fdd\u7559\u4e3a\u6ce8\u91ca\uff0c\u4fbf\u4e8e\u624b\u52a8\u5207\u6362\u3002`,
    `${' '.repeat(indent)}# \u5b98\u65b9 cache.nixos.org \u4f5c\u4e3a\u4fdd\u5e95\u6e90\uff0c\u59cb\u7ec8\u542f\u7528\u3002`,
    `${' '.repeat(indent)}substituters = [`
  ];

  for (const mirror of mirrors) {
    const status = mirror.ok && mirror.ms !== undefined
      ? `${mirror.ms}ms`
      : `error${mirror.error ? `: ${mirror.error}` : ''}`;
    const marker = mirror.url === activeMirror ? 'enabled best' : 'candidate';
    lines.push(`${' '.repeat(indent + 2)}# ${status.padEnd(16)} ${mirror.name} (${marker})`);
    if (mirror.url === activeMirror) {
      lines.push(`${' '.repeat(indent + 2)}"${mirror.url}"`);
    } else {
      lines.push(`${' '.repeat(indent + 2)}# "${mirror.url}"`);
    }
    lines.push(`${' '.repeat(indent + 2)}#`);
  }

  lines.push(`${' '.repeat(indent + 2)}"${officialNixCacheUrl}"`);
  lines.push(`${' '.repeat(indent)}];`);

  return lines.join('\n');
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

async function refreshChineseMirrorStatuses(context: vscode.ExtensionContext): Promise<void> {
  try {
    const statuses = await fetchChineseMirrorStatuses();
    await context.globalState.update(chineseMirrorStateKey, statuses);
  } catch {
    if (context.globalState.get<MirrorStatus[]>(chineseMirrorStateKey, []).length === 0) {
      await context.globalState.update(
        chineseMirrorStateKey,
        fallbackChineseMirrorUrls.map((url) => ({
          name: getMirrorName(url),
          url,
          ok: false,
          error: 'not tested'
        }))
      );
    }
  }
}

async function fetchChineseMirrorStatuses(): Promise<MirrorStatus[]> {
  const pages = await Promise.all(chineseMirrorSources.map((source) => fetchText(source).catch(() => '')));
  const urls = pages.flatMap((page) => extractMatches(page, /https:\/\/[^\s"'<>|}]+\/nix-channels\/store/g));
  const uniqueUrls = Array.from(new Set([...urls, ...fallbackChineseMirrorUrls].map((url) => url.replace(/[),.;]+$/u, ''))));
  const statuses = await Promise.all(uniqueUrls.map((url) => testMirror(url)));

  return statuses.sort((left, right) => {
    if (left.ok !== right.ok) {
      return left.ok ? -1 : 1;
    }

    return (left.ms ?? Number.MAX_SAFE_INTEGER) - (right.ms ?? Number.MAX_SAFE_INTEGER);
  });
}

function testMirror(url: string): Promise<MirrorStatus> {
  return new Promise((resolve) => {
    const start = Date.now();
    const request = https.get(`${url.replace(/\/$/u, '')}/nix-cache-info`, (response) => {
      response.resume();
      response.on('end', () => {
        const ok = response.statusCode !== undefined && response.statusCode >= 200 && response.statusCode < 400;
        resolve({
          name: getMirrorName(url),
          url,
          ok,
          ms: Date.now() - start,
          error: ok ? undefined : `HTTP ${response.statusCode}`
        });
      });
    });

    request.setTimeout(3000, () => {
      request.destroy();
      resolve({
        name: getMirrorName(url),
        url,
        ok: false,
        error: 'timeout'
      });
    });
    request.on('error', (error) => {
      resolve({
        name: getMirrorName(url),
        url,
        ok: false,
        error: error.message
      });
    });
  });
}

function getMirrorName(url: string): string {
  if (url.includes('tuna.tsinghua')) {
    return 'TUNA';
  }
  if (url.includes('ustc.edu.cn')) {
    return 'USTC';
  }
  if (url.includes('sjtu.edu.cn')) {
    return 'SJTUG';
  }
  if (url.includes('nju.edu.cn')) {
    return 'NJU';
  }

  return new URL(url).hostname;
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
    matches.push(match[1] ?? match[0]);
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
