import * as https from 'https';
import * as vscode from 'vscode';

import { chineseLanguagePackIds } from './constants';

export function isChineseLanguagePackInstalled(): boolean {
  return chineseLanguagePackIds.some((id) => vscode.extensions.getExtension(id) !== undefined);
}

export function getFullRange(document: vscode.TextDocument): vscode.Range {
  return new vscode.Range(
    document.positionAt(0),
    document.positionAt(document.getText().length)
  );
}

export function extractMatches(input: string, pattern: RegExp): string[] {
  const matches: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(input)) !== null) {
    matches.push(match[1] ?? match[0]);
  }

  return matches;
}

export function decodeHtml(input: string): string {
  return input
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function fetchText(url: string): Promise<string> {
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
