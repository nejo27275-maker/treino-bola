/** Perfil do jogador: configuração curta, opcional, editável e apagável. */
import { MATERIAL_LABEL, SPACE_LABEL } from '../../content/catalog.ts';
import { POSITION_LABEL, SKILLS, SKILL_ORDER } from '../../core/skills.ts';
import type { DifficultyPref, Experience, Material, Modality, Position, Profile, SessionPref, SkillId, Space } from '../../core/types.ts';
import { MATERIALS, MINUTE_OPTIONS, POSITIONS, SPACES } from '../../core/types.ts';
import type { AppContext } from '../app.ts';
import { button, card, choiceGroup, field, pageHeader } from '../components.ts';
import { h } from '../dom.ts';
import type { Screen } from '../router.ts';

const EXPERIENCE_OPTIONS: { value: Experience; label: string }[] = [
  { value: 'iniciante', label: 'Estou começando' },
  { value: 'as_vezes', label: 'Jogo às vezes' },
  { value: 'regular', label: 'Jogo toda semana' },
  { value: 'competitivo', label: 'Treino em escolinha/time' },
];

const MODALITY_OPTIONS: { value: Modality; label: string }[] = [
  { value: 'futsal', label: 'Quadra (futsal)' },
  { value: 'society', label: 'Society' },
  { value: 'campo', label: 'Campo' },
  { value: 'nao_sei', label: 'Ainda não sei' },
];

const DIFFICULTY_OPTIONS: { value: DifficultyPref; label: string }[] = [
  { value: 'facil', label: 'Começar fácil' },
  { value: 'medio', label: 'Médio' },
  { value: 'dificil', label: 'Desafiador' },
];

const SESSION_OPTIONS: { value: SessionPref; label: string }[] = [
  { value: 'curtas', label: 'Sessões curtas (até 20 min)' },
  { value: 'longas', label: 'Sessões mais longas' },
];

export function defaultProfile(now: Date): Profile {
  return {
    apelido: '',
    posicao: 'nao_sei',
    experiencia: 'as_vezes',
    focos: [],
    minutosDisponiveis: 20,
    espaco: 'medio',
    materiais: ['bola'],
    dificuldade: 'facil',
    preferenciaSessao: 'curtas',
    modalidade: 'nao_sei',
    criadoEm: now.toISOString(),
    atualizadoEm: now.toISOString(),
  };
}

export async function perfilScreen(ctx: AppContext): Promise<Screen> {
  const existing = await ctx.repo.getProfile();
  const p = existing ?? defaultProfile(ctx.now());

  const apelido = h('input', { type: 'text', value: p.apelido, maxlength: 40, autocomplete: 'nickname', placeholder: 'Opcional' });
  const posicao = choiceGroup<Position>('Posição preferida', 'posicao', POSITIONS.map((v) => ({ value: v, label: POSITION_LABEL[v] })), p.posicao, false);
  const experiencia = choiceGroup<Experience>('Experiência no futebol', 'experiencia', EXPERIENCE_OPTIONS, p.experiencia, false);
  const modalidade = choiceGroup<Modality>('Onde será o interclasse?', 'modalidade', MODALITY_OPTIONS, p.modalidade, false);
  const focos = choiceGroup<SkillId>(
    'Fundamentos que quer melhorar',
    'focos',
    SKILL_ORDER.map((s) => ({ value: s, label: SKILLS[s].curto })),
    p.focos,
    true,
  );
  const minutos = choiceGroup<string>('Tempo por dia para treinar', 'minutos', MINUTE_OPTIONS.map((m) => ({ value: String(m), label: `${m} min` })), String(p.minutosDisponiveis), false);
  const espaco = choiceGroup<Space>('Espaço disponível', 'espaco', SPACES.map((v) => ({ value: v, label: SPACE_LABEL[v] })), p.espaco, false);
  const materiais = choiceGroup<Material>('Materiais que você tem', 'materiais', MATERIALS.map((v) => ({ value: v, label: MATERIAL_LABEL[v] })), p.materiais, true);
  const dificuldade = choiceGroup<DifficultyPref>('Nível de dificuldade preferido', 'dificuldade', DIFFICULTY_OPTIONS, p.dificuldade, false);
  const sessao = choiceGroup<SessionPref>('Duração das sessões', 'sessao', SESSION_OPTIONS, p.preferenciaSessao, false);

  const status = h('p', { role: 'status', 'aria-live': 'polite', class: 'small' });

  const save = async (event: Event) => {
    event.preventDefault();
    const minutosValue = Number(minutos.values()[0] ?? 20);
    const profile: Profile = {
      apelido: apelido.value.trim().slice(0, 40),
      posicao: posicao.values()[0] ?? 'nao_sei',
      experiencia: experiencia.values()[0] ?? 'as_vezes',
      focos: focos.values(),
      minutosDisponiveis: Number.isFinite(minutosValue) ? minutosValue : 20,
      espaco: espaco.values()[0] ?? 'medio',
      materiais: materiais.values(),
      dificuldade: dificuldade.values()[0] ?? 'facil',
      preferenciaSessao: sessao.values()[0] ?? 'curtas',
      modalidade: modalidade.values()[0] ?? 'nao_sei',
      criadoEm: existing?.criadoEm ?? ctx.now().toISOString(),
      atualizadoEm: ctx.now().toISOString(),
    };
    try {
      await ctx.repo.saveProfile(profile);
      await ctx.repo.setOnboardingSeen();
      ctx.toast('Perfil salvo. Suas recomendações foram atualizadas.', 'sucesso');
      ctx.navigate(existing ? '/config' : '/avaliacao');
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : String(error);
    }
  };

  const form = h(
    'form',
    { onsubmit: save, novalidate: true },
    card(
      { title: 'Sobre você' },
      field('Como quer ser chamado? (opcional)', apelido, 'Pode ser um apelido. Não pedimos nome completo, idade ou contato.'),
      posicao.el,
      experiencia.el,
      modalidade.el,
    ),
    card({ title: 'Objetivos' }, focos.el, dificuldade.el),
    card({ title: 'Rotina e espaço' }, minutos.el, sessao.el, espaco.el, materiais.el, h('p', { class: 'small muted' }, 'Sem cones? Garrafas, chinelos ou mochilas servem. Os exercícios mostram alternativas.')),
    h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { type: 'submit', class: 'btn primary' }, 'Salvar perfil'), existing ? null : button('Pular por agora', async () => {
      await ctx.repo.setOnboardingSeen();
      ctx.navigate('/');
    }, { variant: 'ghost' })),
    status,
  );

  const el = h(
    'div',
    { class: 'stack' },
    pageHeader(existing ? 'Editar perfil' : 'Configurar perfil', 'Tudo é opcional e pode ser alterado depois. Quando faltar informação, o aplicativo usa recomendações conservadoras.', { href: existing ? '#/config' : '#/', label: 'Voltar' }),
    form,
  );
  return { title: existing ? 'Editar perfil' : 'Configurar perfil', el };
}
