export type InquiryStatus =
  | "new"
  | "contacted"
  | "accepted"
  | "in_progress"
  | "closed";
export type InquiryService = "brand_identity" | "web_design" | "product_design";
export type InquiryBudgetRange =
  | "under_5k"
  | "5k_10k"
  | "10k_25k"
  | "25k_50k"
  | "50k_plus"
  | "not_sure";
export type InquirySimilarityStatus =
  | "not_requested"
  | "pending"
  | "processing"
  | "ready"
  | "failed";
export type InquirySimilarityMatch = {
  inquiry_id: string;
  score: number;
};

export type InquiryRow = {
  id: string;
  client_id: string | null;
  name: string;
  email: string;
  company: string | null;
  service: InquiryService | null;
  project_brief: string;
  budget_range: InquiryBudgetRange | null;
  timeline: string | null;
  priority_score: number;
  similarity_opt_in: boolean;
  similarity_opted_in_at: string | null;
  similarity_status: InquirySimilarityStatus;
  similarity_matches: InquirySimilarityMatch[];
  reviewed_complexity: number | null;
  actual_hours: number | null;
  review_notes: string | null;
  status: InquiryStatus;
  created_at: string;
  updated_at: string;
};

export type InquiryInsert = {
  client_id?: string | null;
  name: string;
  email: string;
  company: string | null;
  service: InquiryService | null;
  project_brief: string;
  budget_range: InquiryBudgetRange | null;
  timeline: string | null;
  priority_score?: number;
  similarity_opt_in?: boolean;
};

export type ClientProfileRow = {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  created_at: string;
  updated_at: string;
};

export type ClientProfileInsert = {
  user_id: string;
  full_name: string;
  email: string;
};

export type ClientCompanyRow = {
  id: string;
  client_id: string;
  company_name: string;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
};

export type EmployeeRow = {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

export type TeamMemberRow = {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  title: string | null;
  specialty: string | null;
  availability_status: "available" | "busy" | "away" | "on_leave";
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type InquiryBriefRow = {
  id: string;
  inquiry_id: string;
  design_goal: string;
  brand_message: string;
  target_audience: string | null;
  desired_outcomes: string | null;
  references: string | null;
  time_budget: string | null;
  design_complexity: number | null;
  created_at: string;
  updated_at: string;
};

export type InquiryBriefInsert = {
  inquiry_id: string;
  design_goal: string;
  brand_message: string;
  target_audience: string | null;
  desired_outcomes: string | null;
  references: string | null;
  time_budget: string | null;
  design_complexity: number | null;
};

export type InquiryReferenceFileStatus =
  | "awaiting_upload"
  | "queued"
  | "ready"
  | "rejected";

export type InquiryReferenceFileRow = {
  id: string;
  inquiry_id: string | null;
  object_path: string;
  file_name: string;
  content_type: "image/jpeg" | "image/png" | "image/webp";
  byte_size: number;
  status: InquiryReferenceFileStatus;
  failure_reason: string | null;
  created_at: string;
  processed_at: string | null;
};

export type ProjectRevenueRow = {
  id: string;
  project_id: string;
  entry_type: "revenue" | "refund";
  amount: number;
  currency: string;
  received_on: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
};

export type ProjectPayoutRow = {
  id: string;
  project_id: string;
  team_member_id: string;
  role_name: string;
  entry_type: "payout" | "refund";
  amount: number;
  currency: string;
  status: "planned" | "paid";
  paid_on: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export type ExpenseCategory =
  | "software"
  | "rent"
  | "tools"
  | "equipment"
  | "services"
  | "travel"
  | "other";

export type ExpenseRow = {
  id: string;
  name: string;
  category: ExpenseCategory;
  amount: number;
  currency: string;
  incurred_on: string;
  notes: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type RecurringExpenseRow = Omit<ExpenseRow, "incurred_on"> & {
  frequency: "monthly" | "quarterly" | "yearly";
  starts_on: string;
  ends_on: string | null;
};

export type QuarterlyReportRow = {
  id: string;
  period_year: number;
  period_quarter: number;
  version: number;
  supersedes_report_id: string | null;
  period_start: string;
  period_end: string;
  currency: string;
  total_revenue: number;
  total_payouts: number;
  total_expenses: number;
  total_recurring_expenses: number;
  net_result: number;
  status: "draft" | "published";
  generated_at: string;
  published_at: string | null;
  published_by: string | null;
  created_at: string;
};

export type QuarterlyReportLineRow = {
  id: string;
  report_id: string;
  line_type: "revenue" | "payout" | "expense" | "recurring_expense";
  project_id: string | null;
  label: string;
  amount: number;
  created_at: string;
};

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ProjectRow = {
  id: string;
  inquiry_id: string;
  project_name: string;
  deadline_date: string | null;
  project_manager_id: string | null;
  status: "active" | "completed";
  completed_at: string | null;
  accepted_at: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectChannelRow = {
  id: string;
  inquiry_id: string | null;
  project_id: string | null;
  channel_name: string;
  description: string;
  channel_type: "project" | "general" | "announcement" | "system";
  moderator_member_id: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type ProjectMemberRow = {
  id: string;
  project_id: string;
  team_member_id: string;
  role_name: string;
  created_at: string;
  updated_at: string;
};

export type ProjectChannelMessageRow = {
  id: string;
  channel_id: string;
  sender_member_id: string | null;
  sender_name: string;
  sender_role: string | null;
  body: string;
  message_source: "app" | "slack";
  created_at: string;
};

export type SlackInstallationRow = {
  id: boolean;
  workspace_id: string;
  workspace_name: string;
  bot_user_id: string;
  encrypted_bot_token: string | null;
  is_active: boolean;
  installed_by: string;
  installed_at: string;
  updated_at: string;
};

export type SlackUserMappingRow = {
  team_member_id: string;
  slack_user_id: string;
  verified_at: string;
  linked_by: string;
};

export type SlackProjectChannelRow = {
  project_id: string;
  slack_channel_id: string;
  slack_channel_name: string;
  synced_at: string;
};

export type SlackProjectSyncJobRow = {
  project_id: string;
  action: "create" | "archive" | "sync_members";
  status: "pending" | "processing" | "retry" | "completed" | "failed";
  attempt_count: number;
  available_at: string;
  claimed_at: string | null;
  last_error: string | null;
  updated_at: string;
};

export type SlackMessageOutboxRow = {
  id: string;
  project_id: string;
  project_channel_message_id: string;
  status: "pending" | "processing" | "retry" | "delivered" | "failed";
  attempt_count: number;
  available_at: string;
  claimed_at: string | null;
  slack_message_ts: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type SystemActivityLogRow = {
  id: string;
  channel_id: string;
  table_name: string;
  record_id: string | null;
  operation: "INSERT" | "UPDATE" | "DELETE";
  changed_columns: string[];
  actor_user_id: string | null;
  occurred_at: string;
};

export type ProjectMessageRow = {
  id: string;
  inquiry_id: string;
  sender_type: "client" | "designer" | "team";
  sender_id: string | null;
  sender_name: string;
  body: string;
  created_at: string;
  updated_at?: string;
};

export type ProjectRequestLogRow = {
  id: string;
  inquiry_id: string;
  created_at: string;
  completed_at: string | null;
  payout_amount: number;
  payout_currency: string;
  status: "new" | "in_progress" | "completed" | "cancelled";
  notes: string | null;
};

export type CompanyExpenseRow = {
  id: string;
  inquiry_id: string | null;
  gross_revenue: number;
  total_paid_out: number;
  contributor_name: string;
  contributor_amount: number;
  contributor_role: string | null;
  created_at: string;
  updated_at: string;
};

export type FaqItemRow = {
  id: string;
  question: string;
  answer: string;
  category: string;
  is_published: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      inquiries: {
        Row: InquiryRow;
        Insert: InquiryInsert & {
          id?: string;
          status?: InquiryStatus;
          priority_score?: number;
          similarity_opt_in?: boolean;
          similarity_opted_in_at?: string | null;
          similarity_status?: InquirySimilarityStatus;
          similarity_matches?: InquirySimilarityMatch[];
          reviewed_complexity?: number | null;
          actual_hours?: number | null;
          review_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<InquiryRow> & {
          client_id?: string | null;
        };
        Relationships: [];
      };
      client_profiles: {
        Row: ClientProfileRow;
        Insert: ClientProfileInsert & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<ClientProfileRow>;
        Relationships: [];
      };
      client_companies: {
        Row: ClientCompanyRow;
        Insert: {
          client_id: string;
          company_name: string;
          is_primary?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<ClientCompanyRow>;
        Relationships: [];
      };
      employees: {
        Row: EmployeeRow;
        Insert: {
          user_id: string;
          full_name: string;
          email: string;
          role: string;
          title?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<EmployeeRow>;
        Relationships: [];
      };
      team_members: {
        Row: TeamMemberRow;
        Insert: {
          id?: string;
          user_id: string;
          full_name: string;
          email: string;
          title?: string | null;
          specialty?: string | null;
          availability_status?: TeamMemberRow["availability_status"];
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<TeamMemberRow>;
        Relationships: [];
      };
      inquiry_briefs: {
        Row: InquiryBriefRow;
        Insert: InquiryBriefInsert & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<InquiryBriefRow>;
        Relationships: [];
      };
      inquiry_reference_files: {
        Row: InquiryReferenceFileRow;
        Insert: Omit<InquiryReferenceFileRow, "created_at" | "processed_at"> & {
          created_at?: string;
          processed_at?: string | null;
        };
        Update: Partial<InquiryReferenceFileRow>;
        Relationships: [];
      };
      project_revenue: {
        Row: ProjectRevenueRow;
        Insert: Omit<ProjectRevenueRow, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      project_payouts: {
        Row: ProjectPayoutRow;
        Insert: Omit<ProjectPayoutRow, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Pick<ProjectPayoutRow, "status" | "paid_on">>;
        Relationships: [];
      };
      expenses: {
        Row: ExpenseRow;
        Insert: Omit<ExpenseRow, "id" | "created_at" | "updated_at" | "voided_at" | "void_reason"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
          voided_at?: string | null;
          void_reason?: string | null;
        };
        Update: never;
        Relationships: [];
      };
      recurring_expenses: {
        Row: RecurringExpenseRow;
        Insert: Omit<RecurringExpenseRow, "id" | "created_at" | "updated_at" | "voided_at" | "void_reason"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
          voided_at?: string | null;
          void_reason?: string | null;
        };
        Update: never;
        Relationships: [];
      };
      quarterly_reports: {
        Row: QuarterlyReportRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      quarterly_report_lines: {
        Row: QuarterlyReportLineRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      projects: {
        Row: ProjectRow;
        Insert: {
          id?: string;
          inquiry_id: string;
          project_name: string;
          deadline_date?: string | null;
          project_manager_id?: string | null;
          status?: "active" | "completed";
          completed_at?: string | null;
          accepted_at?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<ProjectRow>;
        Relationships: [];
      };
      project_members: {
        Row: ProjectMemberRow;
        Insert: {
          id?: string;
          project_id: string;
          team_member_id: string;
          role_name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<ProjectMemberRow>;
        Relationships: [];
      };
      system_activity_logs: {
        Row: SystemActivityLogRow;
        Insert: {
          id?: string;
          channel_id: string;
          table_name: string;
          record_id?: string | null;
          operation: "INSERT" | "UPDATE" | "DELETE";
          changed_columns?: string[];
          actor_user_id?: string | null;
          occurred_at?: string;
        };
        Update: Partial<SystemActivityLogRow>;
        Relationships: [];
      };
      customer_support_messages: {
        Row: {
          request_id: string;
          question: string;
          answer: string;
          model: string;
          created_at: string;
        };
        Insert: {
          request_id: string;
          question: string;
          answer: string;
          model: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      project_channels: {
        Row: ProjectChannelRow;
        Insert: {
          id?: string;
          inquiry_id?: string | null;
          project_id?: string | null;
          channel_name: string;
          description?: string;
          channel_type: ProjectChannelRow["channel_type"];
          moderator_member_id?: string | null;
          is_archived?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<ProjectChannelRow>;
        Relationships: [];
      };
      project_channel_messages: {
        Row: ProjectChannelMessageRow;
        Insert: {
          id?: string;
          channel_id: string;
          sender_member_id?: string | null;
          sender_name: string;
          sender_role?: string | null;
          body: string;
          message_source?: ProjectChannelMessageRow["message_source"];
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      slack_installations: {
        Row: SlackInstallationRow;
        Insert: Omit<SlackInstallationRow, "installed_at" | "updated_at" | "is_active"> & {
          installed_at?: string;
          updated_at?: string;
          is_active?: boolean;
        };
        Update: Partial<SlackInstallationRow>;
        Relationships: [];
      };
      slack_user_mappings: {
        Row: SlackUserMappingRow;
        Insert: Omit<SlackUserMappingRow, "verified_at"> & { verified_at?: string };
        Update: Partial<SlackUserMappingRow>;
        Relationships: [];
      };
      slack_project_channels: {
        Row: SlackProjectChannelRow;
        Insert: Omit<SlackProjectChannelRow, "synced_at"> & { synced_at?: string };
        Update: Partial<SlackProjectChannelRow>;
        Relationships: [];
      };
      slack_project_sync_jobs: {
        Row: SlackProjectSyncJobRow;
        Insert: Omit<SlackProjectSyncJobRow, "attempt_count" | "available_at" | "claimed_at" | "last_error" | "updated_at"> & {
          attempt_count?: number;
          available_at?: string;
          claimed_at?: string | null;
          last_error?: string | null;
          updated_at?: string;
        };
        Update: Partial<SlackProjectSyncJobRow>;
        Relationships: [];
      };
      slack_message_outbox: {
        Row: SlackMessageOutboxRow;
        Insert: Omit<SlackMessageOutboxRow, "id" | "attempt_count" | "available_at" | "claimed_at" | "slack_message_ts" | "last_error" | "created_at" | "updated_at"> & {
          id?: string;
          attempt_count?: number;
          available_at?: string;
          claimed_at?: string | null;
          slack_message_ts?: string | null;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<SlackMessageOutboxRow>;
        Relationships: [];
      };
      slack_event_receipts: {
        Row: {
          event_id: string;
          outcome: "processing" | "stored" | "ignored";
          provider_channel_id: string | null;
          provider_message_ts: string | null;
          received_at: string;
          processed_at: string | null;
        };
        Insert: {
          event_id: string;
          outcome?: "processing" | "stored" | "ignored";
          provider_channel_id?: string | null;
          provider_message_ts?: string | null;
          received_at?: string;
          processed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["slack_event_receipts"]["Row"]>;
        Relationships: [];
      };
      slack_provider_messages: {
        Row: {
          provider_channel_id: string;
          provider_message_ts: string;
          project_channel_message_id: string;
        };
        Insert: {
          provider_channel_id: string;
          provider_message_ts: string;
          project_channel_message_id: string;
        };
        Update: never;
        Relationships: [];
      };
      project_messages: {
        Row: ProjectMessageRow;
        Insert: {
          inquiry_id: string;
          sender_type: "client" | "designer" | "team";
          sender_id?: string | null;
          sender_name?: string;
          body: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<ProjectMessageRow>;
        Relationships: [];
      };
      project_request_logs: {
        Row: ProjectRequestLogRow;
        Insert: {
          inquiry_id: string;
          created_at?: string;
          completed_at?: string | null;
          payout_amount?: number;
          payout_currency?: string;
          status?: "new" | "in_progress" | "completed" | "cancelled";
          notes?: string | null;
        };
        Update: Partial<ProjectRequestLogRow>;
        Relationships: [];
      };
      company_expenses: {
        Row: CompanyExpenseRow;
        Insert: {
          inquiry_id?: string | null;
          gross_revenue?: number;
          total_paid_out?: number;
          contributor_name: string;
          contributor_amount?: number;
          contributor_role?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<CompanyExpenseRow>;
        Relationships: [];
      };
      faq_items: {
        Row: FaqItemRow;
        Insert: {
          question: string;
          answer: string;
          category?: string;
          is_published?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<FaqItemRow>;
        Relationships: [];
      };
    };

    Views: { [_ in never]: never };
    Functions: {
      create_public_inquiry_with_brief: {
        Args: { p_inquiry: Json; p_brief: Json };
        Returns: string;
      };
      create_public_inquiry_with_references: {
        Args: { p_inquiry: Json; p_brief: Json; p_reference_ids: string[] };
        Returns: string;
      };
      list_project_channels: {
        Args: Record<PropertyKey, never>;
        Returns: ProjectChannelRow[];
      };
      claim_slack_project_sync_jobs: {
        Args: { p_limit?: number };
        Returns: SlackProjectSyncJobRow[];
      };
      claim_slack_message_outbox: {
        Args: { p_limit?: number };
        Returns: SlackMessageOutboxRow[];
      };
      complete_slack_project_sync: {
        Args: {
          p_project_id: string;
          p_slack_channel_id: string;
          p_slack_channel_name: string;
        };
        Returns: undefined;
      };
      persist_slack_inbound_message: {
        Args: {
          p_event_id: string;
          p_provider_channel_id: string;
          p_provider_message_ts: string;
          p_slack_user_id: string;
          p_body: string;
        };
        Returns: string;
      };
      recurring_expense_occurrences: {
        Args: { p_from: string; p_to: string };
        Returns: Array<{
          recurring_expense_id: string;
          due_on: string;
          name: string;
          category: ExpenseCategory;
          amount: number;
          currency: string;
        }>;
      };
      compute_quarter_totals: {
        Args: { p_year: number; p_quarter: number };
        Returns: Array<{
          currency: string;
          total_revenue: number;
          total_payouts: number;
          total_expenses: number;
          total_recurring_expenses: number;
          net_result: number;
        }>;
      };
      publish_quarterly_report: {
        Args: { p_year: number; p_quarter: number };
        Returns: string;
      };
    };
    Enums: {
      expense_category: ExpenseCategory;
    };
    CompositeTypes: { [_ in never]: never };
  };
};
