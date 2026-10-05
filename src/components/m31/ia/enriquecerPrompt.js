/**
 * Prompt builder para classificação de Frentes com IA.
 * Foco: atribuir a Frente mais específica e compatível dentro de cada Área.
 */

export function buildEnriquecerPrompt(tasksByArea, areas, frentesByArea) {
  const frentesSection = areas.map(area => {
    const areaFrentes = frentesByArea[area.id] || [];
    const frenteLines = areaFrentes.length > 0
      ? areaFrentes.map(f => `  • ID: ${f.id}, Nome: "${f.nome}", Slug: ${f.slug}`).join('\n')
      : '  (nenhuma frente cadastrada)';
    return `【Área: ${area.nome} (ID: ${area.id}, Slug: ${area.slug})】\n${frenteLines}`;
  }).join('\n\n');

  const tasksSection = areas.map(area => {
    const areaTasks = tasksByArea[area.id] || [];
    if (areaTasks.length === 0) return null;
    const taskLines = areaTasks.map(t =>
      `  • ID: ${t.id}, Título: "${t.titulo}", Descrição: "${(t.descricao || '').slice(0, 200)}"`
    ).join('\n');
    return `【Área: ${area.nome}】\n${taskLines}`;
  }).filter(Boolean).join('\n\n');

  return `Você é um especialista em organização operacional do evento M31 Filhas. Sua tarefa é classificar tarefas em Frentes (linhas de trabalho específicas dentro de cada Área).

CONCEITOS:
- Área = grande setor responsável (ex: Louvor, Credenciamento, Intercessão)
- Frente = linha de trabalho específica dentro da Área (ex: "Repertório e Setlist", "Ensaios", "Escala e Equipe")
- Tarefa = ação executável dentro de uma Frente

FRENTES EXISTENTES POR ÁREA:
${frentesSection}

TAREFAS PARA CLASSIFICAR (têm Área definida, mas não têm Frente):
${tasksSection}

CRITÉRIOS PARA DEFINIR UMA FRENTE:
- mesmo objetivo
- mesmo tipo de trabalho
- mesma equipe responsável
- mesma etapa do evento
- recorrência de várias tarefas relacionadas

REGRAS OBRIGATÓRIAS:
1. Consulte as Frentes já existentes da Área e escolha a mais específica e compatível.
2. NÃO use "Geral" quando houver uma Frente mais específica.
3. NÃO crie nova Frente para uma única tarefa isolada — atribua à Frente existente mais próxima.
4. Só sugira uma NOVA Frente quando houver 2+ tarefas com o mesmo tema que não se encaixam em nenhuma Frente existente.
5. Evite Frentes duplicadas com nomes parecidos (se já existe "Ensaios", não crie "Ensaio Musical").
6. Sugira nomes curtos, claros e orientados à função (ex: "Repertório e Setlist", "Ensaios", "Escala e Equipe", "Equipamentos e Som", "Condução do Culto").
7. Se uma tarefa não se encaixa perfeitamente em nenhuma Frente existente e é isolada, atribua à Frente existente mais próxima — nunca deixe sem classificar.
8. Para Áreas sem nenhuma Frente cadastrada: só sugira nova Frente se houver 2+ tarefas; se houver apenas 1 tarefa, atribua frente_nova_nome vazio e marque confianca "baixo".

Retorne JSON: objeto com array "suggestions", cada item tendo:
- task_id (string): ID da tarefa
- frente_id (string): ID de uma Frente existente, ou string vazia se sugerindo nova
- frente_nova_nome (string): nome sugerido para nova Frente, ou string vazia se usando existente
- motivo (string): explicação curta da escolha (por que esta Frente)
- confianca (string): "alto" (quase certeza), "medio" (plausível), "baixo" (incerto)

Inclua uma sugestão para CADA tarefa listada.`;
}

/**
 * Prompt para otimização de Frentes existentes.
 * Analisa: nomes confusos, duplicadas, tarefas mal alocadas, frentes vazias.
 */
export function buildOtimizarFrentesPrompt(areas, frentes, tasksByFrente) {
  const areasList = areas.map(a => `- ID: ${a.id}, Nome: "${a.nome}", Slug: ${a.slug}`).join('\n');

  const frentesList = frentes.map(f => {
    const area = areas.find(a => a.id === f.area_id);
    const tasks = tasksByFrente[f.id] || [];
    const taskTitles = tasks.slice(0, 10).map(t => `  · "${t.titulo}"`).join('\n');
    return `【Frente: "${f.nome}" (ID: ${f.id})】\n  Área: ${area?.nome || '?'} | Tarefas: ${tasks.length}\n${taskTitles || '  (vazia)'}`;
  }).join('\n\n');

  return `Você é um especialista em organização operacional do evento M31 Filhas. Analise a estrutura atual de Frentes e sugira otimizações.

ÁREAS:
${areasList}

FRENTES ATUAIS E SUAS TAREFAS:
${frentesList}

TIPOS DE OTIMIZAÇÃO:
1. renomear — Frente com nome confuso, genérico ou pouco descritivo. Sugira um nome mais claro e orientado à função.
2. unir — Duas ou mais Frentes na mesma Área com nomes parecidos ou escopo sobreposto. Sugira fundir em uma só.
3. mover_tarefa — Tarefa que está na Frente errada. Sugira mover para a Frente mais adequada.
4. excluir_vazia — Frente sem nenhuma tarefa. Sugira exclusão.

REGRAS:
1. Só sugira renomear se o nome atual for realmente confuso ou genérico (ex: "Geral", "Diversos", "Outros").
2. Só sugira unir se as Frentes têm escopo claramente sobreposto e estão na mesma Área.
3. Só sugira mover tarefa se houver uma Frente claramente mais adequada.
4. Só sugira excluir Frentes que estão realmente vazias (0 tarefas).
5. Se a estrutura estiver boa, retorne array vazio — não force sugestões.

Retorne JSON: objeto com array "otimizacoes", cada item tendo:
- tipo (string): "renomear" | "unir" | "mover_tarefa" | "excluir_vazia"
- frente_id (string): ID da Frente afetada (ou origem, no caso de unir/mover)
- frente_id_destino (string): ID da Frente destino (apenas para "unir" e "mover_tarefa")
- task_id (string): ID da tarefa (apenas para "mover_tarefa")
- novo_nome (string): novo nome sugerido (apenas para "renomear")
- motivo (string): explicação curta da sugestão
- confianca (string): "alto" | "medio" | "baixo"`;
}