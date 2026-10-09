import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Node test-only loader for the server modules' TypeScript and Next path alias.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,export {}', shortCircuit: true };
  if (specifier === 'next/headers') return { url: 'data:text/javascript,export function cookies(){throw new Error("No cookie request in worker tests")}', shortCircuit: true };
  if (specifier.startsWith('@/')) return { url: new URL(`../apps/web/${specifier.slice(2)}.ts`, import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith('.') && context.parentURL?.endsWith('.ts') && !specifier.endsWith('.ts')) return { url: new URL(`${specifier}.ts`, context.parentURL).href, shortCircuit: true };
  return nextResolve(specifier, context);
}
export async function load(url, context, nextLoad) {
  if (url.endsWith('.ts') && !url.includes('/node_modules/')) {
    const source = await readFile(new URL(url), 'utf8');
    return { format: 'module', source: ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText, shortCircuit: true };
  }
  return nextLoad(url, context);
}
