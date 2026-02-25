export type UserRole = 'admin' | 'editor' | 'viewer'
export type VestStatus = 'pending' | 'vested' | 'lapsed'
export type GrantStatus = 'draft' | 'active' | 'cancelled'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: UserRole
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Employee {
  id: string
  name: string
  employee_code: string
  personal_email: string | null
  official_email: string | null
  phone: string | null
  department: string | null
  designation: string | null
  join_date: string | null
  exit_date: string | null
  auth_user_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // joins
  grants?: Grant[]
}

export interface Grant {
  id: string
  grant_number: string
  employee_id: string
  grant_date: string
  total_options: number
  status: GrantStatus
  source_file: string | null
  letter_path: string | null
  letter_signed: boolean
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // joins
  employee?: Employee
  vesting_events?: VestingEvent[]
}

export interface VestingEvent {
  id: string
  grant_id: string
  employee_id: string
  vest_date: string
  options_count: number
  status: VestStatus
  created_at: string
}

export interface Valuation {
  id: string
  effective_date: string
  fair_value: number
  note: string | null
  created_by: string | null
  created_at: string
}

export interface GrantLetter {
  id: string
  grant_id: string | null
  grant_number: string | null
  storage_path: string
  filename: string
  file_size: number | null
  matched: boolean
  uploaded_by: string | null
  uploaded_at: string
}

export interface VestingComputed {
  total: number
  vested: number
  lapsed: number
  unvested: number
  vestedValue: number
  pct: number
}

// Database type for Supabase client
export type Database = {
  public: {
    Tables: {
      profiles:       { Row: Profile;      Insert: Partial<Profile>;      Update: Partial<Profile> }
      employees:      { Row: Employee;     Insert: Partial<Employee>;     Update: Partial<Employee> }
      grants:         { Row: Grant;        Insert: Partial<Grant>;        Update: Partial<Grant> }
      vesting_events: { Row: VestingEvent; Insert: Partial<VestingEvent>; Update: Partial<VestingEvent> }
      valuations:     { Row: Valuation;    Insert: Partial<Valuation>;    Update: Partial<Valuation> }
      grant_letters:  { Row: GrantLetter;  Insert: Partial<GrantLetter>;  Update: Partial<GrantLetter> }
    }
  }
}
