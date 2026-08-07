import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

type NixPathLink = {
  range: vscode.Range;
  target: string;
};

const nixPathPattern = /(^|[\s[\({=,:;"'])((?:\.{1,2}\/|\/)[A-Za-z0-9._+@%=-][A-Za-z0-9._+@%=\-/]*)(?=[\s\])};,"']|$)/g;

export function registerNavigation(context: vscode.ExtensionContext): void {
  const definitionProvider = vscode.languages.registerDefinitionProvider('nix', {
    provideDefinition(document, position) {
      const target = findNixPathTargetAtPosition(document, position);
      if (!target) {
        return undefined;
      }

      return new vscode.Location(vscode.Uri.file(target), new vscode.Position(0, 0));
    }
  });

  const documentLinkProvider = vscode.languages.registerDocumentLinkProvider('nix', {
    provideDocumentLinks(document) {
      return findNixPathLinks(document).map(({ range, target }) => {
        const link = new vscode.DocumentLink(range, vscode.Uri.file(target));
        link.tooltip = 'Open Nix file';
        return link;
      });
    }
  });

  context.subscriptions.push(definitionProvider, documentLinkProvider);
}

function findNixPathTargetAtPosition(document: vscode.TextDocument, position: vscode.Position): string | undefined {
  const line = document.lineAt(position.line);
  const links = findNixPathLinksInLine(document, line.text, position.line);
  const link = links.find((candidate) => candidate.range.contains(position));

  return link?.target;
}

function findNixPathLinks(document: vscode.TextDocument): NixPathLink[] {
  const links: NixPathLink[] = [];
  const maxLines = Math.min(document.lineCount, 10_000);

  for (let lineNumber = 0; lineNumber < maxLines; lineNumber += 1) {
    links.push(...findNixPathLinksInLine(document, document.lineAt(lineNumber).text, lineNumber));
  }

  return links;
}

function findNixPathLinksInLine(document: vscode.TextDocument, text: string, lineNumber: number): NixPathLink[] {
  const code = stripNixLineComment(text);
  const links: NixPathLink[] = [];
  let match: RegExpExecArray | null;

  nixPathPattern.lastIndex = 0;
  while ((match = nixPathPattern.exec(code)) !== null) {
    const rawPath = match[2];
    if (!rawPath || rawPath.includes('${')) {
      continue;
    }

    const target = resolveNixLocalPath(document.uri.fsPath, rawPath);
    if (!target) {
      continue;
    }

    const start = match.index + match[1].length;
    const end = start + rawPath.length;
    links.push({
      range: new vscode.Range(lineNumber, start, lineNumber, end),
      target
    });
  }

  return links;
}

function stripNixLineComment(text: string): string {
  let inDoubleQuotedString = false;
  let inIndentedString = false;
  let escaping = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

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

    if (character === '#') {
      return text.slice(0, index);
    }
  }

  return text;
}

function resolveNixLocalPath(documentPath: string, rawPath: string): string | undefined {
  const normalizedRawPath = rawPath.replace(/\//g, path.sep);
  const basePath = path.isAbsolute(normalizedRawPath)
    ? normalizedRawPath
    : path.resolve(path.dirname(documentPath), normalizedRawPath);

  const candidates = [basePath];
  if (path.extname(basePath) === '') {
    candidates.push(`${basePath}.nix`);
  }

  for (const candidate of candidates) {
    const resolved = resolveExistingNixTarget(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return undefined;
}

function resolveExistingNixTarget(candidate: string): string | undefined {
  try {
    const stat = fs.statSync(candidate);
    if (stat.isFile()) {
      return candidate;
    }

    if (stat.isDirectory()) {
      const defaultNix = path.join(candidate, 'default.nix');
      if (fs.existsSync(defaultNix) && fs.statSync(defaultNix).isFile()) {
        return defaultNix;
      }
    }
  } catch {
    return undefined;
  }

  return undefined;
}
