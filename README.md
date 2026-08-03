<p align="center">
  <img src="images/icon.png" width="128" height="128" alt="Nix Forge logo">
</p>

<h1 align="center">Nix Forge</h1>

<p align="center">
  Nix snippets, templates, and formatting for Visual Studio Code.
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=ZiYyun.nix-forge">
    <img alt="VS Marketplace Version" src="https://img.shields.io/visual-studio-marketplace/v/ZiYyun.nix-forge?label=marketplace">
  </a>
  <a href="https://marketplace.visualstudio.com/items?itemName=ZiYyun.nix-forge">
    <img alt="VS Marketplace Installs" src="https://img.shields.io/visual-studio-marketplace/i/ZiYyun.nix-forge">
  </a>
  <a href="https://github.com/ZiYyyun/vscode-Nix-Forge/stargazers">
    <img alt="GitHub stars" src="https://img.shields.io/github/stars/ZiYyyun/vscode-Nix-Forge?style=flat">
  </a>
  <a href="LICENSE">
    <img alt="License" src="https://img.shields.io/github/license/ZiYyyun/vscode-Nix-Forge">
  </a>
</p>

<p align="center">
  <a href="#english">English</a> |
  <a href="#中文">中文</a> |
  <a href="#日本語">日本語</a>
</p>

<p align="center">
  <img src="images/template-picker.png" alt="Nix Forge template picker" width="860">
</p>

---

## English

### Template First

Nix Forge is built around fast template insertion. Open the command palette with `Ctrl+Shift+P`, run `Nix-Forge: Insert Configuration Template`, and choose the Nix pattern you need.

You can also press `Ctrl+Alt+N` in a `.nix` file.

Built-in templates:

- `System Packages`: the most common `configuration.nix` package list.
- `NixOS Module`: a full module skeleton with `imports`, `options`, `config`, and `meta`.
- `Flake`: a `flake.nix` with inputs, packages, and a development shell.
- `Home Manager`: a user-level Home Manager configuration.
- `Dotfiles`: manage `.gitconfig`, Neovim, Starship, and other dotfiles with Home Manager.
- `Package Builder`: a package skeleton based on `stdenv.mkDerivation`.
- `Dev Shell`: a standalone `mkShell` development environment.

If a Chinese VS Code language pack is installed, Nix Forge adds Chinese comments and tested Nix binary cache mirror candidates to NixOS and Flake templates. `https://cache.nixos.org/` is always kept enabled as a safe fallback.

### Formatting

Use `Shift+Alt+F` or run `Nix-Forge: Format Document`.

Nix Forge tries external formatters first:

- `nixfmt`
- `nixpkgs-fmt`
- `alejandra`

If none are available, it falls back to the built-in indentation formatter, so basic formatting still works on Windows, WSL, and remote machines without a Nix toolchain in `$PATH`.

### Settings

```json
{
  "nixLanguageTools.formatter.command": "auto",
  "nixLanguageTools.formatter.args": [],
  "nixLanguageTools.formatter.useBuiltInFallback": true,
  "nixLanguageTools.templates.updateFromWikiOnFirstActivation": true
}
```

Custom templates:

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

---

## 中文

### 代码片段优先

Nix Forge 的核心功能是快速插入常用 Nix 模板。按 `Ctrl+Shift+P` 打开命令面板，运行 `Nix-Forge: Insert Configuration Template`，然后选择需要的模板。

也可以在 `.nix` 文件里直接按 `Ctrl+Alt+N`。

内置模板：

- `System Packages`：最常用的 `configuration.nix` 软件包列表。
- `NixOS Module`：包含 `imports`、`options`、`config`、`meta` 的完整模块骨架。
- `Flake`：包含 inputs、packages、devShell 的 `flake.nix` 模板。
- `Home Manager`：用户级 Home Manager 配置。
- `Dotfiles`：用 Home Manager 管理 `.gitconfig`、Neovim、Starship 等 dotfiles。
- `Package Builder`：基于 `stdenv.mkDerivation` 的打包模板。
- `Dev Shell`：独立的 `mkShell` 开发环境。

>[!NOTE] 关于大陆的网络问题
>
> 如果检测到中文 VS Code 语言包，Nix Forge 会自动在 NixOS 和 Flake 模板中加入中文注释，以及测速后的国内源。并且官方镜像`https://cache.nixos.org/` 会始终保留并启用，无需担心换源失败。

### 格式化

按 `Shift+Alt+F`，或运行 `Nix-Forge: Format Document`。

Nix Forge 会优先尝试外部格式化器：

- `nixfmt`
- `nixpkgs-fmt`
- `alejandra`

如果都不可用，就使用内置缩进格式化器。因此即使 Windows、WSL 或远程环境里没有完整 Nix 工具链，也能做基础格式化。

### 设置

```json
{
  "nixLanguageTools.formatter.command": "auto",
  "nixLanguageTools.formatter.args": [],
  "nixLanguageTools.formatter.useBuiltInFallback": true,
  "nixLanguageTools.templates.updateFromWikiOnFirstActivation": true
}
```

自定义模板：

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

---

## 日本語

### テンプレート中心

Nix Forge は、よく使う Nix テンプレートをすばやく挿入するための拡張機能です。`Ctrl+Shift+P` でコマンドパレットを開き、`Nix-Forge: Insert Configuration Template` を実行して必要なテンプレートを選択します。

`.nix` ファイルでは `Ctrl+Alt+N` でも実行できます。

組み込みテンプレート：

- `System Packages`: `configuration.nix` でよく使うシステムパッケージ一覧。
- `NixOS Module`: `imports`、`options`、`config`、`meta` を含む NixOS モジュール雛形。
- `Flake`: inputs、packages、devShell を含む `flake.nix` テンプレート。
- `Home Manager`: ユーザー単位の Home Manager 設定。
- `Dotfiles`: Home Manager で `.gitconfig`、Neovim、Starship などの dotfiles を管理するテンプレート。
- `Package Builder`: `stdenv.mkDerivation` ベースのパッケージ作成テンプレート。
- `Dev Shell`: `mkShell` を使う開発環境テンプレート。

中国語の VS Code 言語パックがインストールされている場合、NixOS と Flake テンプレートには中国語コメントと、速度確認済みの Nix バイナリキャッシュ候補が追加されます。`https://cache.nixos.org/` は公式フォールバックとして常に有効です。

### フォーマット

`Shift+Alt+F`、または `Nix-Forge: Format Document` を実行します。

Nix Forge は最初に外部フォーマッターを試します：

- `nixfmt`
- `nixpkgs-fmt`
- `alejandra`

利用できない場合は、内蔵のインデントフォーマッターにフォールバックします。

### 設定

```json
{
  "nixLanguageTools.formatter.command": "auto",
  "nixLanguageTools.formatter.args": [],
  "nixLanguageTools.formatter.useBuiltInFallback": true,
  "nixLanguageTools.templates.updateFromWikiOnFirstActivation": true
}
```

