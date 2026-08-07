export const wikiTemplateStateKey = 'nixLanguageTools.wikiTemplates';
export const wikiTemplateFirstActivationKey = 'nixLanguageTools.didFetchWikiTemplates';
export const chineseMirrorStateKey = 'nixLanguageTools.chineseMirrorStatuses';

export const nixfmtExtensionId = 'brettm12345.nixfmt-vscode';
export const nixfmtMarketplaceUrl = 'https://marketplace.visualstudio.com/items?itemName=brettm12345.nixfmt-vscode';

export const nixosFormatterSnippet = 'environment.systemPackages = with pkgs; [\n  nixfmt-rfc-style\n];';
export const homeManagerFormatterSnippet = 'home.packages = with pkgs; [\n  nixfmt-rfc-style\n];';

export const officialNixCacheUrl = 'https://cache.nixos.org/';
export const officialNixCachePublicKey = 'cache.nixos.org-1:6NCHdD59X431o0gWypbMrAURkbJ16ZPMQFGspcDShjY=';

export const chineseLanguagePackIds = [
  'MS-CEINTL.vscode-language-pack-zh-hans',
  'MS-CEINTL.vscode-language-pack-zh-hant'
];

export const chineseMirrorSources = [
  'https://wiki.nixos.org/w/index.php?title=China&action=raw',
  'https://mirrors.tuna.tsinghua.edu.cn/help/nix-channels/',
  'https://mirrors.ustc.edu.cn/help/nix-channels.html'
];

export const fallbackChineseMirrorUrls = [
  'https://mirrors.tuna.tsinghua.edu.cn/nix-channels/store',
  'https://mirrors.ustc.edu.cn/nix-channels/store',
  'https://mirror.sjtu.edu.cn/nix-channels/store'
];

export const wikiSources = [
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
