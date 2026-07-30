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
Nix-Forge: Insert Configuration Template
```

Built-in fallback templates include:

- Flake
- NixOS Module
- Home Manager
- Package Derivation
- Dev Shell

Inserted templates include short usage comments. If a Chinese VS Code language pack is installed, Nix Forge also adds Chinese source-switching notes and common binary cache mirror URLs. Without a Chinese language pack, those mirror notes are omitted.

### Fetch Templates from NixOS Wiki

On first activation, Nix Forge can fetch Nix examples from the official NixOS Wiki and cache them locally.

Sources:

- https://wiki.nixos.org/wiki/Flakes
- https://wiki.nixos.org/wiki/NixOS_modules
- https://wiki.nixos.org/wiki/Home_Manager

If the network is unavailable or Wiki markup changes, built-in templates remain available.

For Chinese-language users, Nix Forge also tries to refresh common `/nix-channels/store` mirror URLs from the NixOS Wiki China page and major mirror help pages. Cached or fallback mirror URLs are only inserted as comments.

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
