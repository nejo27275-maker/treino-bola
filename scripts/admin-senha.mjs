#!/usr/bin/env node
/**
 * Gera uma nova senha aleatória para o painel de administração e grava só o hash
 * (PBKDF2-SHA-256, sal aleatório) em src/admin/credencial.ts. A senha aparece UMA vez no
 * terminal e não é salva em lugar nenhum: guarde-a num gerenciador de senhas.
 *
 * Uso: npm run admin:senha   (depois, faça o build, publique o site e gere o APK de novo)
 */
import { pbkdf2Sync, randomBytes, randomInt } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destino = path.join(root, 'src', 'admin', 'credencial.ts');

// Sem caracteres que se confundem (0/O, 1/l/I): mais fácil de digitar no celular.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const GRUPOS = 4;
const POR_GRUPO = 6;
// Recomendação atual (OWASP) para PBKDF2-HMAC-SHA256; precisa bater com ITERACOES_MINIMAS.
const ITERACOES = 600000;

function gerarSenha() {
  const grupos = [];
  for (let g = 0; g < GRUPOS; g++) {
    let grupo = '';
    // randomInt é uniforme (sem o viés do resto da divisão).
    for (let i = 0; i < POR_GRUPO; i++) grupo += ALFABETO[randomInt(ALFABETO.length)];
    grupos.push(grupo);
  }
  return grupos.join('-');
}

const senha = gerarSenha();
const sal = randomBytes(16);
const hash = pbkdf2Sync(senha.normalize('NFC'), sal, ITERACOES, 32, 'sha256');
const bits = Math.floor(GRUPOS * POR_GRUPO * Math.log2(ALFABETO.length));
const hoje = new Date().toISOString().slice(0, 10);

const conteudo = `/**
 * Credencial do painel de administração, gerada por \`npm run admin:senha\` em ${hoje}.
 * Só o resultado do PBKDF2-SHA-256 fica aqui (o repositório é público); a senha não está em
 * lugar nenhum do código. Senha aleatória de ${GRUPOS * POR_GRUPO} caracteres (~${bits} bits).
 */
import type { Credencial } from './acesso.ts';

export const CREDENCIAL: Credencial = {
  algoritmo: 'PBKDF2-SHA-256',
  iteracoes: ${ITERACOES},
  sal: '${sal.toString('base64')}',
  hash: '${hash.toString('base64')}',
  criadaEm: '${hoje}',
};
`;

await writeFile(destino, conteudo);
console.log('Nova senha do painel de administração (aparece só agora; guarde-a):');
console.log(`\n    ${senha}\n`);
console.log(`Hash gravado em ${path.relative(root, destino)}.`);
console.log('Faça o build, publique o site e gere o APK de novo para a nova senha valer.');
