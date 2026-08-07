import * as https from 'https';
import * as vscode from 'vscode';

import {
  chineseMirrorSources,
  chineseMirrorStateKey,
  fallbackChineseMirrorUrls,
  officialNixCachePublicKey,
  officialNixCacheUrl
} from './constants';
import { MirrorStatus } from './types';
import { extractMatches, fetchText } from './utils';

export async function getChineseMirrorStatuses(context: vscode.ExtensionContext): Promise<MirrorStatus[]> {
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

export async function refreshChineseMirrorStatuses(context: vscode.ExtensionContext): Promise<void> {
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

export function buildNixosMirrorBlock(mirrors: MirrorStatus[], indent: number): string {
  return `${' '.repeat(indent)}nix.settings = {
${buildSubstitutersBlock(mirrors, indent + 2)}

${' '.repeat(indent + 2)}# cache.nixos.org \u5b98\u65b9\u7f13\u5b58\u7684\u516c\u94a5\uff1b\u5982\u679c\u53ea\u7528\u5b98\u65b9\u548c\u5176\u540c\u6b65\u955c\u50cf\uff0c\u8fd9\u4e00\u884c\u4e0d\u8981\u5220\u3002
${' '.repeat(indent + 2)}trusted-public-keys = [
${' '.repeat(indent + 4)}"${officialNixCachePublicKey}"
${' '.repeat(indent + 2)}];
${' '.repeat(indent)}};`;
}

export function buildFlakeMirrorBlock(mirrors: MirrorStatus[], indent: number): string {
  return `${' '.repeat(indent)}nixConfig = {
${buildSubstitutersBlock(mirrors, indent + 2)}

${' '.repeat(indent + 2)}extra-trusted-public-keys = [
${' '.repeat(indent + 4)}"${officialNixCachePublicKey}"
${' '.repeat(indent + 2)}];
${' '.repeat(indent)}};`;
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
