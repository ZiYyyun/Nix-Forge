# Nix Forge

Nix Forge is a lightweight VS Code extension for writing Nix files with less friction.

It provides Nix document formatting, quick configuration templates, and optional template updates from the official NixOS Wiki. It is designed to work even when the local machine does not have a full Nix toolchain installed.

## Features

### Format Nix Documents

Nix Forge registers a formatter for `.nix` files.

Shortcut:

| Platform | Shortcut |
| --- | --- |
| Windows / Linux | `Shift+Alt+F` |
| macOS | `Shift+Alt+F` |

Command Palette:

```text
Nix-Forge: Format Document
```

Formatting behavior:

1. Try external formatter commands in this order:
   - `nixfmt`
   - `nixpkgs-fmt`
   - `alejandra`
2. If none are available, use Nix Forge's built-in indentation formatter.

The built-in formatter is intentionally conservative. It focuses on indentation and delimiter-aware cleanup, which makes it useful on Windows, WSL, remote Linux, and development hosts without `nix` in `$PATH`. For exact official formatter output, install `nixfmt-rfc-style`, `nixpkgs-fmt`, or `alejandra` in your Nix environment.

### Insert Nix Templates

Nix Forge can insert common Nix configuration templates into the active editor.

Shortcut:

| Platform | Shortcut |
| --- | --- |
| Windows / Linux | `Ctrl+Alt+N` |
| macOS | `Cmd+Alt+N` |

Command Palette:

```text
Nix: Insert Configuration Template
```

Built-in fallback templates include:

- Flake
- NixOS Module
- Home Manager
- Package Derivation
- Dev Shell

### Fetch Templates from NixOS Wiki

On first activation, Nix Forge can fetch Nix examples from the official NixOS Wiki and cache them locally.

Sources:

- https://wiki.nixos.org/wiki/Flakes
- https://wiki.nixos.org/wiki/NixOS_modules
- https://wiki.nixos.org/wiki/Home_Manager

If the network is unavailable or Wiki markup changes, built-in templates remain available.

Manual refresh:

```text
Nix-Forge: Refresh Templates from NixOS Wiki
```

### Formatter Helper Commands

If you want to use an external formatter, Nix Forge provides helper commands:

```text
Nix-Forge: Open Formatter Extension
Nix-Forge: Copy Formatter NixOS Snippet
Nix-Forge: Copy Formatter Home Manager Snippet
```

Note: VS Code extensions cannot directly install system commands into NixOS, WSL, or remote Linux. A VS Code Extension Pack can only install other VS Code extensions, not `nixfmt` itself.

## Settings

### Formatter Command

Use `auto` to try `nixfmt`, `nixpkgs-fmt`, and `alejandra`:

```json
{
  "nixLanguageTools.formatter.command": "auto"
}
```

Use a specific formatter:

```json
{
  "nixLanguageTools.formatter.command": "alejandra",
  "nixLanguageTools.formatter.args": []
}
```

Disable the built-in fallback formatter:

```json
{
  "nixLanguageTools.formatter.useBuiltInFallback": false
}
```

### Wiki Template Updates

Disable first-activation Wiki template fetching:

```json
{
  "nixLanguageTools.templates.updateFromWikiOnFirstActivation": false
}
```

### Custom Templates

Add your own templates:

```json
{
  "nixLanguageTools.templates.custom": [
    {
      "label": "My NixOS Module",
      "description": "Project-specific module",
      "body": "{ config, pkgs, ... }:\n\n{\n  environment.systemPackages = with pkgs; [ ];\n}\n"
    }
  ]
}
```

## Development

Install dependencies:

```powershell
npm install
```

Compile:

```powershell
npm run compile
```

Run in VS Code:

1. Open this project folder in VS Code.
2. Press `F5`.
3. Test the extension in the Extension Development Host window.

## Packaging

Install `vsce`:

```powershell
npm install -g @vscode/vsce
```

Create a local `.vsix` package:

```powershell
vsce package
```

Install the package locally:

```powershell
code --install-extension nix-forge-0.0.1.vsix
```

## Publishing

Publishing to the VS Code Marketplace does not require GitHub, but pushing to GitHub first is strongly recommended.

Recommended order:

1. Create a GitHub repository.
2. Add `repository`, `bugs`, `homepage`, `license`, and a real `publisher` value in `package.json`.
3. Commit and push the project.
4. Package and test the `.vsix` locally.
5. Publish with `vsce publish`.

Basic publish flow:

```powershell
vsce login <publisher-id>
vsce publish
```

Before publishing, replace this placeholder in `package.json`:

```json
{
  "publisher": "local-dev"
}
```

with your real Visual Studio Marketplace publisher ID.
