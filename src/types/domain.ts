export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'todo' | 'doing' | 'done';
export type WorkspaceRole = 'owner' | 'member';

export type TaskCategory = {
  id: string;
  owner_id: string;
  name: string;
  color: string;
  icon: string;
  position: number;
  updated_at: string;
};

export type Task = {
  id: string;
  title: string;
  description: string | null;
  priority: Priority;
  status: TaskStatus;
  due_at: string | null;
  owner_id: string;
  category_id: string | null;
  updated_at: string;
};

export type ChecklistItem = {
  id: string;
  task_id: string;
  title: string;
  is_done: boolean;
  position: number;
};

export type Workspace = {
  id: string;
  name: string;
  owner_id: string;
  updated_at: string;
};

export type WorkspaceMember = {
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  created_at: string;
};

export type WorkspaceFolder = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  position: number;
  updated_at: string;
};

export type FolderMember = {
  folder_id: string;
  user_id: string;
  role: WorkspaceRole;
  created_at: string;
};

export type FolderChecklist = {
  id: string;
  folder_id: string;
  title: string;
  position: number;
  updated_at: string;
};

export type FolderChecklistItem = {
  id: string;
  checklist_id: string;
  title: string;
  is_done: boolean;
  position: number;
  assigned_label: string | null;
};

export type FolderSection = {
  id: string;
  folder_id: string;
  kind: 'text' | 'image' | 'map' | 'budget';
  title: string;
  body: string | null;
  media_url: string | null;
  position: number;
  updated_at: string;
};

export type FolderFile = {
  id: string;
  folder_id: string;
  uploaded_by: string;
  name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

export type FolderComment = {
  id: string;
  folder_id: string;
  author_id: string;
  author_name: string | null;
  body: string;
  created_at: string;
};

export type WorkspaceInvitation = {
  id: string;
  workspace_id: string;
  folder_id: string | null;
  email: string;
  role: WorkspaceRole;
  status: 'pending' | 'accepted' | 'revoked';
  invited_by: string;
  created_at?: string;
};

export type SharedNote = {
  id: string;
  workspace_id: string;
  title: string;
  body: string;
  updated_at: string;
};

export type SharedList = {
  id: string;
  workspace_id: string;
  title: string;
  updated_at: string;
};

export type SharedListItem = {
  id: string;
  list_id: string;
  title: string;
  is_done: boolean;
  position: number;
};

export type Reminder = {
  id: string;
  owner_id: string;
  workspace_id: string | null;
  title: string;
  remind_at: string;
  notification_id: string | null;
  is_done: boolean;
};
