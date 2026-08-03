// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
};

type TaskAssistantPayload = {
  question?: unknown;
};

type TaskAssistantTask = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  due_at: string | null;
  category_id: string | null;
  updated_at: string;
};

type TaskAssistantCategory = {
  id: string;
  name: string;
};

type TaskAssistantChecklistItem = {
  task_id: string;
  title: string;
  is_done: boolean;
  position: number;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return jsonResponse({}, 200);
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Metodo nao permitido.' }, 405);
  }

  const authorization = req.headers.get('Authorization');
  if (!authorization) {
    return jsonResponse({ error: 'Usuario nao autenticado.' }, 401);
  }

  const openAiApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAiApiKey) {
    return jsonResponse({ error: 'OPENAI_API_KEY nao configurada.' }, 500);
  }

  let payload: TaskAssistantPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'JSON invalido.' }, 400);
  }

  const question = typeof payload.question === 'string' ? payload.question.trim() : '';
  if (question.length < 3) {
    return jsonResponse({ error: 'Envie uma pergunta com pelo menos 3 caracteres.' }, 400);
  }
  if (question.length > 500) {
    return jsonResponse({ error: 'Pergunta muito longa.' }, 400);
  }

  const supabase = createClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    global: {
      headers: { Authorization: authorization },
    },
  });

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return jsonResponse({ error: 'Sessao invalida.' }, 401);
  }

  const [taskResult, categoryResult, checklistResult] = await Promise.all([
    supabase
      .from('tasks')
      .select('id,title,description,priority,status,due_at,category_id,updated_at')
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(100),
    supabase.from('task_categories').select('id,name').order('position', { ascending: true }),
    supabase.from('task_checklist_items').select('task_id,title,is_done,position').order('position', { ascending: true }),
  ]);

  if (taskResult.error || categoryResult.error || checklistResult.error) {
    return jsonResponse({ error: 'Nao foi possivel carregar suas tarefas.' }, 500);
  }

  const tasks = (taskResult.data ?? []) as TaskAssistantTask[];
  const categories = (categoryResult.data ?? []) as TaskAssistantCategory[];
  const checklistItems = (checklistResult.data ?? []) as TaskAssistantChecklistItem[];
  const timeZone = Deno.env.get('ASSISTANT_TIME_ZONE') ?? 'America/Sao_Paulo';
  const taskContext = buildTaskContext(tasks, categories, checklistItems, timeZone);
  const localNow = formatLocalDateTime(new Date().toISOString(), timeZone);

  const openAiResult = await fetch('https://api.openai.com/v1/responses', {
    body: JSON.stringify({
      input: [
        {
          content:
            'Voce e um assistente de produtividade dentro de um app de tarefas. Responda em portugues do Brasil, seja objetivo e use somente os dados fornecidos. Sempre responda horarios usando prazo_local. Nunca converta, mencione ou exiba prazo_iso_utc para o usuario. Se a pergunta pedir criar, editar, concluir ou excluir tarefas, explique que nesta versao voce apenas consulta tarefas.',
          role: 'system',
        },
        {
          content: `Data atual local: ${localNow}\nFuso horario: ${timeZone}\n\nTarefas do usuario:\n${taskContext}\n\nPergunta: ${question}`,
          role: 'user',
        },
      ],
      max_output_tokens: 700,
      model: Deno.env.get('OPENAI_MODEL') ?? 'gpt-5.6-luna',
      temperature: 0.2,
    }),
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  if (!openAiResult.ok) {
    return jsonResponse({ error: 'Nao foi possivel consultar a OpenAI agora.' }, 502);
  }

  const openAiJson = await openAiResult.json();
  const answer = extractResponseText(openAiJson);
  if (!answer) {
    return jsonResponse({ error: 'A OpenAI nao retornou texto.' }, 502);
  }

  return jsonResponse({ answer });
});

function getSupabaseUrl() {
  const value = Deno.env.get('SUPABASE_URL');
  if (!value) {
    throw new Error('SUPABASE_URL nao configurada.');
  }
  return value;
}

function getSupabasePublishableKey() {
  const publishableKeys = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (publishableKeys) {
    const parsed = JSON.parse(publishableKeys);
    if (parsed.default) {
      return parsed.default;
    }
  }

  const legacyAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (legacyAnonKey) {
    return legacyAnonKey;
  }

  throw new Error('Chave publica do Supabase nao configurada.');
}

function buildTaskContext(
  tasks: TaskAssistantTask[],
  categories: TaskAssistantCategory[],
  checklistItems: TaskAssistantChecklistItem[],
  timeZone: string,
) {
  if (!tasks.length) {
    return 'Nenhuma tarefa encontrada.';
  }

  const categoriesById = new Map(categories.map((category) => [category.id, category.name]));
  const checklistByTaskId = checklistItems.reduce((acc, item) => {
    const items = acc.get(item.task_id) ?? [];
    items.push(item);
    acc.set(item.task_id, items);
    return acc;
  }, new Map<string, TaskAssistantChecklistItem[]>());

  return tasks
    .map((task) => {
      const checklist = (checklistByTaskId.get(task.id) ?? [])
        .slice(0, 8)
        .map((item) => `${item.is_done ? 'feito' : 'pendente'}: ${item.title}`)
        .join('; ');

      return JSON.stringify({
        categoria: task.category_id ? categoriesById.get(task.category_id) ?? 'Sem categoria' : 'Sem categoria',
        checklist: checklist || null,
        descricao: task.description,
        prazo_iso_utc: task.due_at,
        prazo_local: task.due_at ? formatLocalDateTime(task.due_at, timeZone) : null,
        prioridade: task.priority,
        status: task.status,
        titulo: task.title,
      });
    })
    .join('\n');
}

function formatLocalDateTime(value: string, timeZone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(date);
}

function extractResponseText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === 'string') {
    return payload.output_text.trim();
  }

  const output = Array.isArray(payload.output) ? payload.output : [];
  return output
    .flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
    .map((content) => (typeof content?.text === 'string' ? content.text : ''))
    .join('\n')
    .trim();
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
}
