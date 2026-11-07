export type InquiryStatus = "new" | "contacted" | "in_progress" | "closed";
export type InquiryService = "brand_identity" | "web_design" | "product_design";
export type InquiryBudgetRange =
  | "under_5k"
  | "5k_10k"
  | "10k_25k"
  | "25k_50k"
  | "50k_plus"
  | "not_sure";

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

export type ProjectBriefRow = {
  id: string;
  inquiry_id: string;
  design_goal: string;
  brand_message: string;
  target_audience: string | null;
  desired_outcomes: string | null;
  references: string | null;
  time_budget: string | null;
  design_complexity: number | null;
  priority_score: number | null;
  priority_label: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectBriefInsert = {
  inquiry_id: string;
  design_goal: string;
  brand_message: string;
  target_audience: string | null;
  desired_outcomes: string | null;
  references: string | null;
  time_budget: string | null;
  design_complexity: number | null;
  priority_score: number | null;
  priority_label: string | null;
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
      project_briefs: {
        Row: ProjectBriefRow;
        Insert: ProjectBriefInsert & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<ProjectBriefRow>;
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
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
