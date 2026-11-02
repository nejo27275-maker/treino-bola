/**
 * Credencial do painel de administração, gerada por `npm run admin:senha` em 2026-11-02.
 * Só o resultado do PBKDF2-SHA-256 fica aqui (o repositório é público); a senha não está em
 * lugar nenhum do código. Senha aleatória de 24 caracteres (~139 bits).
 */
import type { Credencial } from './acesso.ts';

export const CREDENCIAL: Credencial = {
  algoritmo: 'PBKDF2-SHA-256',
  iteracoes: 600000,
  sal: 'TtcJX842ZFsQfd9GLNIXmQ==',
  hash: 'qNi/mkqK7s1SfVFi0mnQyVNw9NRcnpKHWbL8bwJY2F8=',
  criadaEm: '2026-11-02',
};
