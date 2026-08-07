import * as vscode from 'vscode';

import { registerFormatter } from './formatter';
import { refreshChineseMirrorStatuses } from './mirrors';
import { registerNavigation } from './navigation';
import { registerTemplateCommands } from './templates';
import { registerWikiTemplateCommand, refreshWikiTemplatesOnFirstActivation } from './wikiTemplates';

export function activate(context: vscode.ExtensionContext) {
  registerFormatter(context);
  registerNavigation(context);
  registerTemplateCommands(context);
  registerWikiTemplateCommand(context);

  void refreshWikiTemplatesOnFirstActivation(context);
  void refreshChineseMirrorStatuses(context);
}

export function deactivate() {
}
