import { supabase } from '../lib/supabase';

export type TaskAssistantResponse = {
  answer: string;
};

export async function askTaskAssistant(question: string): Promise<TaskAssistantResponse> {
  if (!supabase) {
    throw new Error('Assistente indisponivel sem Supabase configurado.');
  }

  const { data, error } = await supabase.functions.invoke<TaskAssistantResponse>('task-assistant', {
    body: { question },
  });

  if (error) {
    throw new Error(error.message || 'Nao foi possivel consultar o assistente.');
  }

  if (!data?.answer) {
    throw new Error('O assistente nao retornou uma resposta.');
  }

  return data;
}
