import * as vscode from 'vscode';

import { homeManagerFormatterSnippet, nixosFormatterSnippet } from './constants';
import { buildFlakeMirrorBlock, buildNixosMirrorBlock, getChineseMirrorStatuses } from './mirrors';
import { Template } from './types';
import { isChineseLanguagePackInstalled } from './utils';
import { getCachedWikiTemplates } from './wikiTemplates';

const builtInTemplates: Template[] = [
  {
    label: 'NixOS: Install System Packages',
    description: 'configuration.nix: add system-wide packages',
    body: `{ config, pkgs, ... }:

{
  environment.systemPackages = with pkgs; [

  ];
}
`
  },
  {
    label: 'NixOS: Import Modules',
    description: 'configuration.nix: imports list for local modules',
    body: `{ config, pkgs, ... }:

{
  imports = [
    ./hardware-configuration.nix
    # ./modules/desktop.nix
    # ./modules/users.nix
  ];
}
`
  },
  {
    label: 'NixOS: Basic Module',
    description: 'Reusable module with commented options and config',
    body: `{ config, lib, pkgs, ... }:

{
  imports = [
    # ./another-module.nix
  ];

  # Declare options only when this file provides settings for other modules.
  options = {
    # services.example.enable = lib.mkEnableOption "example service";
  };

  config = {
    # services.openssh.enable = true;
    # environment.systemPackages = with pkgs; [ hello ];
  };

  meta = {
    # maintainers = with lib.maintainers; [ ];
  };
}
`
  },
  {
    label: 'Flake: NixOS Configuration',
    description: 'flake.nix: nixosConfigurations host skeleton',
    body: `{
  description = "My NixOS configuration";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
    {
      nixosConfigurations.my-host = nixpkgs.lib.nixosSystem {
        system = "x86_64-linux";
        modules = [
          ./configuration.nix
        ];
      };
    };
}
`
  },
  {
    label: 'Home Manager: User Packages',
    description: 'home.nix: add user-level packages',
    body: `{ config, pkgs, ... }:

{
  home.username = "your-user";
  home.homeDirectory = "/home/your-user";
  home.stateVersion = "24.05";

  home.packages = with pkgs; [

  ];
}
`
  },
  {
    label: 'Home Manager: Dotfiles',
    description: 'home.nix: manage dotfiles from this repository',
    body: `{ config, pkgs, ... }:

{
  home.username = "your-user";
  home.homeDirectory = "/home/your-user";
  home.stateVersion = "24.05";

  home.file.".gitconfig".source = ./dotfiles/gitconfig;
  xdg.configFile."nvim/init.lua".source = ./dotfiles/nvim/init.lua;
  xdg.configFile."starship.toml".source = ./dotfiles/starship.toml;

  # Use text for small generated files.
  # home.file.".config/example/config.toml".text = ''
  #   theme = "dark"
  # '';
}
`
  },
  {
    label: 'Package: mkDerivation',
    description: 'default.nix: package a source project',
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
    label: 'Shell: mkShell',
    description: 'shell.nix: lightweight development shell',
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

export function registerTemplateCommands(context: vscode.ExtensionContext): void {
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

  const copyFormatterNixosSnippet = vscode.commands.registerCommand('nixLanguageTools.copyFormatterNixosSnippet', async () => {
    await copySnippet(nixosFormatterSnippet);
  });

  const copyFormatterHomeManagerSnippet = vscode.commands.registerCommand('nixLanguageTools.copyFormatterHomeManagerSnippet', async () => {
    await copySnippet(homeManagerFormatterSnippet);
  });

  context.subscriptions.push(insertTemplate, copyFormatterNixosSnippet, copyFormatterHomeManagerSnippet);
}

async function pickTemplate(context: vscode.ExtensionContext): Promise<Template | undefined> {
  const config = vscode.workspace.getConfiguration('nixLanguageTools');
  const customTemplates = config.get<Template[]>('templates.custom', []);
  const languageTemplates = isChineseLanguagePackInstalled() ? getChineseOnlyTemplates() : [];
  const templates = [
    ...builtInTemplates,
    ...languageTemplates,
    ...getCachedWikiTemplates(context),
    ...customTemplates
  ];

  const picked = await vscode.window.showQuickPick(
    templates.map((template) => ({
      label: template.label,
      description: template.description,
      detail: template.source,
      template
    })),
    {
      placeHolder: 'Choose what you want to insert'
    }
  );

  return picked?.template;
}

async function buildTemplateBody(context: vscode.ExtensionContext, template: Template): Promise<string> {
  if (template.tags?.includes('china-mirror')) {
    const mirrorStatuses = await getChineseMirrorStatuses(context);
    return template.body
      .replace('__NIXOS_MIRROR_BLOCK__', buildNixosMirrorBlock(mirrorStatuses, 2))
      .replace('__FLAKE_MIRROR_BLOCK__', buildFlakeMirrorBlock(mirrorStatuses, 2));
  }

  return template.body;
}

function getChineseOnlyTemplates(): Template[] {
  return [
    {
      label: 'NixOS: Binary Cache Mirrors (China)',
      description: '\u5355\u72ec\u63d2\u5165\u6362\u6e90\u914d\u7f6e\uff0c\u4e0d\u4f1a\u6df7\u8fdb\u5176\u4ed6\u6a21\u677f',
      body: `{ config, pkgs, ... }:

{
__NIXOS_MIRROR_BLOCK__
}
`,
      tags: ['china-mirror']
    },
    {
      label: 'Flake: Binary Cache Mirrors (China)',
      description: '\u5355\u72ec\u63d2\u5165 flake nixConfig \u6362\u6e90\u914d\u7f6e',
      body: `{
__FLAKE_MIRROR_BLOCK__
}
`,
      tags: ['china-mirror']
    }
  ];
}

async function copySnippet(snippet: string): Promise<void> {
  await vscode.env.clipboard.writeText(snippet);
  vscode.window.showInformationMessage('Nix formatter snippet copied to clipboard.');
}
