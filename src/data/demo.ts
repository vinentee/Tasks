import type {
  ChecklistItem,
  Reminder,
  SharedList,
  SharedListItem,
  SharedNote,
  Task,
  TaskCategory,
  FolderMember,
  FolderChecklist,
  FolderChecklistItem,
  FolderComment,
  FolderFile,
  FolderSection,
  Workspace,
  WorkspaceFolder,
  WorkspaceInvitation,
  WorkspaceMember,
} from '../types/domain';

const now = new Date().toISOString();
const todayAt10 = new Date();
todayAt10.setHours(10, 0, 0, 0);
const todayAt14 = new Date();
todayAt14.setHours(14, 0, 0, 0);
const todayAt19 = new Date();
todayAt19.setHours(19, 0, 0, 0);
const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

export const demoUserId = 'demo-user';

export const demoTaskCategories: TaskCategory[] = [
  {
    id: 'category-work',
    owner_id: demoUserId,
    name: 'Trabalho',
    color: '#2563eb',
    icon: 'briefcase',
    position: 1,
    updated_at: now,
  },
  {
    id: 'category-personal',
    owner_id: demoUserId,
    name: 'Pessoal',
    color: '#0f8f62',
    icon: 'user',
    position: 2,
    updated_at: now,
  },
];

export const demoTasks: Task[] = [
  {
    id: 'task-1',
    title: 'Revisao do Sprint Planning',
    description: null,
    priority: 'high',
    status: 'todo',
    due_at: todayAt10.toISOString(),
    owner_id: demoUserId,
    category_id: 'category-work',
    updated_at: now,
  },
  {
    id: 'task-2',
    title: 'Enviar relatorios trimestrais',
    description: null,
    priority: 'medium',
    status: 'todo',
    due_at: todayAt14.toISOString(),
    owner_id: demoUserId,
    category_id: 'category-work',
    updated_at: now,
  },
  {
    id: 'task-3',
    title: 'Organizar pastas do Drive',
    description: null,
    priority: 'low',
    status: 'done',
    due_at: new Date().toISOString(),
    owner_id: demoUserId,
    category_id: 'category-work',
    updated_at: now,
  },
  {
    id: 'task-4',
    title: 'Treino de pernas e cardio',
    description: null,
    priority: 'high',
    status: 'todo',
    due_at: new Date(new Date().setHours(7, 30, 0, 0)).toISOString(),
    owner_id: demoUserId,
    category_id: 'category-personal',
    updated_at: now,
  },
  {
    id: 'task-5',
    title: 'Leitura: "Habitos Atomicos"',
    description: null,
    priority: 'low',
    status: 'todo',
    due_at: todayAt19.toISOString(),
    owner_id: demoUserId,
    category_id: 'category-personal',
    updated_at: now,
  },
];

export const demoChecklistItems: ChecklistItem[] = [
  { id: 'check-1', task_id: 'task-1', title: 'Listar pendencias', is_done: true, position: 1 },
  { id: 'check-2', task_id: 'task-1', title: 'Marcar horarios fixos', is_done: false, position: 2 },
  { id: 'check-3', task_id: 'task-2', title: 'Conferir itens de limpeza', is_done: false, position: 1 },
];

export const demoWorkspaces: Workspace[] = [
  { id: 'workspace-1', name: 'Casa e rotina', owner_id: demoUserId, updated_at: now },
];

export const demoWorkspaceMembers: WorkspaceMember[] = [
  { workspace_id: 'workspace-1', user_id: demoUserId, role: 'owner', created_at: now },
];

export const demoMemberProfiles = [
  { id: demoUserId, email: 'demo@mytasks.local', full_name: 'Demo' },
  { id: 'demo-partner', email: 'parceiro@email.com', full_name: 'Parceiro' },
];

export const demoFolderMembers: FolderMember[] = [
  { folder_id: 'folder-trip', user_id: demoUserId, role: 'owner', created_at: now },
  { folder_id: 'folder-movies', user_id: demoUserId, role: 'owner', created_at: now },
  { folder_id: 'folder-shopping', user_id: demoUserId, role: 'owner', created_at: now },
];

export const demoWorkspaceFolders: WorkspaceFolder[] = [
  {
    id: 'folder-trip',
    workspace_id: 'workspace-1',
    name: 'Planejamento de Viagem',
    description: 'Programacao de viagem, destinos e arquivos compartilhados.',
    position: 1,
    updated_at: now,
  },
  {
    id: 'folder-movies',
    workspace_id: 'workspace-1',
    name: 'Filmes para assistir',
    description: 'Lista colaborativa de filmes e series.',
    position: 2,
    updated_at: now,
  },
  {
    id: 'folder-shopping',
    workspace_id: 'workspace-1',
    name: 'Lista de Compras',
    description: 'Itens de mercado, casa e compras recorrentes.',
    position: 3,
    updated_at: now,
  },
];

export const demoFolderChecklists: FolderChecklist[] = [
  {
    id: 'folder-checklist-trip',
    folder_id: 'folder-trip',
    title: 'Checklist de Destinos',
    position: 1,
    updated_at: now,
  },
  {
    id: 'folder-checklist-movies',
    folder_id: 'folder-movies',
    title: 'Filmes e series',
    position: 1,
    updated_at: now,
  },
  {
    id: 'folder-checklist-shopping',
    folder_id: 'folder-shopping',
    title: 'Compras',
    position: 1,
    updated_at: now,
  },
];

export const demoFolderChecklistItems: FolderChecklistItem[] = [
  {
    id: 'folder-item-1',
    checklist_id: 'folder-checklist-trip',
    title: 'Reservar passagens para Toquio',
    is_done: true,
    position: 1,
    assigned_label: null,
  },
  {
    id: 'folder-item-2',
    checklist_id: 'folder-checklist-trip',
    title: 'Definir roteiro em Quioto',
    is_done: false,
    position: 2,
    assigned_label: 'Ana',
  },
  {
    id: 'folder-item-3',
    checklist_id: 'folder-checklist-trip',
    title: 'Confirmar Airbnb em Osaka',
    is_done: false,
    position: 3,
    assigned_label: null,
  },
  {
    id: 'folder-item-4',
    checklist_id: 'folder-checklist-movies',
    title: 'Assistir Interestelar',
    is_done: false,
    position: 1,
    assigned_label: null,
  },
  {
    id: 'folder-item-5',
    checklist_id: 'folder-checklist-shopping',
    title: 'Cafe',
    is_done: false,
    position: 1,
    assigned_label: null,
  },
  {
    id: 'folder-item-6',
    checklist_id: 'folder-checklist-shopping',
    title: 'Frutas',
    is_done: true,
    position: 2,
    assigned_label: null,
  },
];

export const demoFolderSections: FolderSection[] = [
  {
    id: 'section-trip-summary',
    folder_id: 'folder-trip',
    kind: 'text',
    title: 'Resumo executivo',
    body: 'Viagem para o Japao com foco em Toquio, Quioto e Osaka. O plano combina reservas, documentos, roteiro por regiao e decisoes compartilhadas.',
    media_url: null,
    position: 1,
    updated_at: now,
  },
  {
    id: 'section-trip-map',
    folder_id: 'folder-trip',
    kind: 'map',
    title: 'Roteiro sugerido',
    body: 'Base em Toquio nos primeiros dias, deslocamento para Quioto e fechamento em Osaka. Agrupe passeios por proximidade para reduzir tempo de transporte.',
    media_url: null,
    position: 2,
    updated_at: now,
  },
  {
    id: 'section-trip-budget',
    folder_id: 'folder-trip',
    kind: 'budget',
    title: 'Orcamento estimado',
    body: 'Orcamento total: R$ 12.000\nPassagens: 35%\nHospedagem: 30%\nAlimentacao: 15%\nPasseios e transporte: 15%\nReserva de seguranca: 5%',
    media_url: null,
    position: 3,
    updated_at: now,
  },
];

export const demoFolderFiles: FolderFile[] = [
  {
    id: 'file-1',
    folder_id: 'folder-trip',
    uploaded_by: demoUserId,
    name: 'vistos_aprovados.pdf',
    storage_path: 'demo/vistos_aprovados.pdf',
    mime_type: 'application/pdf',
    size_bytes: 2400000,
    created_at: now,
  },
  {
    id: 'file-2',
    folder_id: 'folder-trip',
    uploaded_by: demoUserId,
    name: 'seguro_viagem.docx',
    storage_path: 'demo/seguro_viagem.docx',
    mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size_bytes: 1100000,
    created_at: now,
  },
];

export const demoFolderComments: FolderComment[] = [
  {
    id: 'comment-1',
    folder_id: 'folder-trip',
    author_id: demoUserId,
    author_name: 'Ana',
    body: 'Acho melhor trocarmos o hotel de Shinjuku por um em Shibuya.',
    created_at: now,
  },
];

export const demoInvitations: WorkspaceInvitation[] = [
  {
    id: 'invite-1',
    workspace_id: 'workspace-1',
    folder_id: 'folder-movies',
    email: 'parceiro@email.com',
    role: 'member',
    status: 'pending',
    invited_by: demoUserId,
  },
];

export const demoNotes: SharedNote[] = [
  {
    id: 'note-1',
    workspace_id: 'workspace-1',
    title: 'Ideias para a semana',
    body: 'Combinar mercado, contas e tarefas de casa no domingo a noite.',
    updated_at: now,
  },
];

export const demoLists: SharedList[] = [
  { id: 'list-1', workspace_id: 'workspace-1', title: 'Mercado', updated_at: now },
];

export const demoListItems: SharedListItem[] = [
  { id: 'list-item-1', list_id: 'list-1', title: 'Cafe', is_done: false, position: 1 },
  { id: 'list-item-2', list_id: 'list-1', title: 'Frutas', is_done: true, position: 2 },
];

export const demoReminders: Reminder[] = [
  {
    id: 'reminder-1',
    owner_id: demoUserId,
    workspace_id: 'workspace-1',
    title: 'Pagar internet',
    remind_at: tomorrow,
    notification_id: null,
    is_done: false,
  },
];
