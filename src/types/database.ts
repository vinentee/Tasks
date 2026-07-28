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
  WorkspaceRole,
} from './domain';
import type { ThemeKey } from '../theme/tokens';

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  notifications_enabled: boolean;
  theme_key: ThemeKey;
  created_at: string;
  updated_at: string;
};

export type ReceivedWorkspaceInvitation = WorkspaceInvitation & {
  folder_name: string | null;
  workspace_name: string;
  invited_by_name: string | null;
  invited_by_email: string | null;
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile, Partial<Profile> & Pick<Profile, 'id' | 'email'>>;
      workspaces: Table<Workspace, Partial<Workspace> & Pick<Workspace, 'name' | 'owner_id'>>;
      workspace_members: Table<WorkspaceMember>;
      workspace_invitations: Table<
        WorkspaceInvitation,
        Partial<WorkspaceInvitation> & Pick<WorkspaceInvitation, 'workspace_id' | 'email' | 'invited_by'>
      >;
      task_categories: Table<
        TaskCategory,
        Partial<TaskCategory> & Pick<TaskCategory, 'owner_id' | 'name'>
      >;
      tasks: Table<Task, Partial<Task> & Pick<Task, 'title' | 'owner_id'>>;
      task_checklist_items: Table<
        ChecklistItem,
        Partial<ChecklistItem> & Pick<ChecklistItem, 'task_id' | 'title'>
      >;
      shared_notes: Table<SharedNote, Partial<SharedNote> & Pick<SharedNote, 'workspace_id' | 'title'>>;
      shared_lists: Table<SharedList, Partial<SharedList> & Pick<SharedList, 'workspace_id' | 'title'>>;
      shared_list_items: Table<
        SharedListItem,
        Partial<SharedListItem> & Pick<SharedListItem, 'list_id' | 'title'>
      >;
      reminders: Table<Reminder, Partial<Reminder> & Pick<Reminder, 'owner_id' | 'title' | 'remind_at'>>;
      workspace_folders: Table<
        WorkspaceFolder,
        Partial<WorkspaceFolder> & Pick<WorkspaceFolder, 'workspace_id' | 'name'>
      >;
      folder_members: Table<FolderMember>;
      folder_checklists: Table<
        FolderChecklist,
        Partial<FolderChecklist> & Pick<FolderChecklist, 'folder_id' | 'title'>
      >;
      folder_checklist_items: Table<
        FolderChecklistItem,
        Partial<FolderChecklistItem> & Pick<FolderChecklistItem, 'checklist_id' | 'title'>
      >;
      folder_sections: Table<
        FolderSection,
        Partial<FolderSection> & Pick<FolderSection, 'folder_id' | 'kind' | 'title'>
      >;
      folder_files: Table<
        FolderFile,
        Partial<FolderFile> & Pick<FolderFile, 'folder_id' | 'uploaded_by' | 'name' | 'storage_path'>
      >;
      folder_comments: Table<
        FolderComment,
        Partial<FolderComment> & Pick<FolderComment, 'folder_id' | 'author_id' | 'body'>
      >;
    };
    Views: Record<string, never>;
    Functions: {
      accept_workspace_invitation: {
        Args: { invitation_id: string };
        Returns: void;
      };
      create_workspace_invitation: {
        Args: { target_workspace_id: string; invited_email: string; target_folder_id?: string | null };
        Returns: WorkspaceInvitation;
      };
      create_folder: {
        Args: { folder_name: string };
        Returns: WorkspaceFolder;
      };
      list_received_workspace_invitations: {
        Args: Record<string, never>;
        Returns: ReceivedWorkspaceInvitation[];
      };
      reject_workspace_invitation: {
        Args: { invitation_id: string };
        Returns: void;
      };
    };
    Enums: {
      task_priority: 'low' | 'medium' | 'high' | 'urgent';
      task_status: 'todo' | 'doing' | 'done';
      workspace_role: 'owner' | 'member';
      invitation_status: 'pending' | 'accepted' | 'revoked';
    };
    CompositeTypes: Record<string, never>;
  };
};
