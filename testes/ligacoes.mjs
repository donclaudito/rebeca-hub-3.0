import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const base = fileURLToPath(new URL('../public/', import.meta.url));
const html = readFileSync(base + 'index.html', 'utf8');
const js = readFileSync(base + 'app.js', 'utf8');
const ids = new Set([...html.matchAll(/id="([A-Za-z0-9_-]+)"/g)].map((m) => m[1]));
const usados = new Set([...js.matchAll(/\$\('([A-Za-z0-9_-]+)'\)/g)].map((m) => m[1]));
const falta = [...usados].filter((i) => !ids.has(i));
console.log('IDs que o app.js procura:', usados.size);
console.log('Em falta no HTML:', falta.length ? falta.join(', ') : 'nenhum');
// Equilíbrio de <div> no HTML: um div por fechar parte o layout todo.
const abre = (html.match(/<div\b/g) || []).length;
const fecha = (html.match(/<\/div>/g) || []).length;
console.log(`<div> abertos: ${abre} | fechados: ${fecha} | ${abre === fecha ? 'equilibrado' : 'DESEQUILIBRADO'}`);
// IDs novos da trilha
const novos = ['input-trilha', 'trilha-caixa', 'trilha-estado', 'btn-trilha-add', 'btn-trilha-ouvir', 'btn-trilha-tirar', 'trilha-ligada'];
console.log('IDs da trilha presentes:', novos.filter((i) => ids.has(i)).length, 'de', novos.length);