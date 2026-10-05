import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';

const output = new URL('../apps/extension/.output/', import.meta.url);
const files = await Promise.all((await readdir(output)).filter(name => name.endsWith('-chrome.zip')).map(async name => ({ name, modified: (await stat(new URL(name, output))).mtimeMs })));
files.sort((a, b) => b.modified - a.modified);
if (!files.length) throw new Error('ZIP Chrome non trovato.');
const destination = new URL('../downloads/', import.meta.url);
await mkdir(destination, { recursive: true });
await copyFile(new URL(files[0].name, output), new URL('reporty-chrome.zip', destination));
console.log('ZIP pronto: downloads/reporty-chrome.zip');
