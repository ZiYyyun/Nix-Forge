import * as vscode from 'vscode';

import { wikiSources, wikiTemplateFirstActivationKey, wikiTemplateStateKey } from './constants';
import { Template } from './types';
import { decodeHtml, extractMatches, fetchText } from './utils';

export function registerWikiTemplateCommand(context: vscode.ExtensionContext): void {
  const refreshWikiTemplates = vscode.commands.registerCommand('nixLanguageTools.refreshWikiTemplates', async () => {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Refreshing Nix template references from NixOS Wiki'
      },
      async () => {
        const templates = await fetchWikiTemplates();
        await context.globalState.update(wikiTemplateStateKey, templates);
        await context.globalState.update(wikiTemplateFirstActivationKey, true);
        vscode.window.showInformationMessage(`Nix Forge cached ${templates.length} Wiki reference template(s). Enable wiki templates in settings to show them.`);
      }
    );
  });

  context.subscriptions.push(refreshWikiTemplates);
}

export async function refreshWikiTemplatesOnFirstActivation(context: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration('nixLanguageTools');
  const shouldUpdate = config.get<boolean>('templates.updateFromWikiOnFirstActivation', false);
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

export function getCachedWikiTemplates(context: vscode.ExtensionContext): Template[] {
  const config = vscode.workspace.getConfiguration('nixLanguageTools');
  const showWikiTemplates = config.get<boolean>('templates.showWikiTemplates', false);
  if (!showWikiTemplates) {
    return [];
  }

  return context.globalState.get<Template[]>(wikiTemplateStateKey, []);
}

async function fetchWikiTemplates(): Promise<Template[]> {
  const templateGroups = await Promise.all(
    wikiSources.map(async (source) => {
      const raw = await fetchText(source.url);
      return extractNixTemplates(raw, source.label, source.url);
    })
  );

  return templateGroups.flat().slice(0, 8);
}

function extractNixTemplates(raw: string, label: string, source: string): Template[] {
  const blocks = [
    ...extractMatches(raw, /<syntaxhighlight[^>]*lang\s*=\s*["']?nix["']?[^>]*>([\s\S]*?)<\/syntaxhighlight>/gi),
    ...extractMatches(raw, /<syntaxHighlight[^>]*lang\s*=\s*["']?nix["']?[^>]*>([\s\S]*?)<\/syntaxHighlight>/gi),
    ...extractMatches(raw, /\{\{File\|[\s\S]*?3=<nowiki>([\s\S]*?)<\/nowiki>[\s\S]*?lang=nix[\s\S]*?\}\}/gi)
  ];

  return blocks
    .map((block) => decodeHtml(block).trim())
    .filter((block) => block.includes('{') && block.includes('}') && block.length >= 40 && block.length <= 2_000)
    .slice(0, 3)
    .map((body, index) => ({
      label: `Wiki Reference: ${label} #${index + 1}`,
      description: 'Optional reference copied from the NixOS Wiki',
      source,
      body: `${body}\n`,
      tags: ['wiki']
    }));
}
