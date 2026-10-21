export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      absence_alerts: {
        Row: {
          alert_date: string
          created_at: string
          id: string
          student_id: string
        }
        Insert: {
          alert_date: string
          created_at?: string
          id?: string
          student_id: string
        }
        Update: {
          alert_date?: string
          created_at?: string
          id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "absence_alerts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          attendance_date: string
          checked_in_at: string
          id: string
          is_late: boolean
          method: string
          student_id: string
        }
        Insert: {
          attendance_date: string
          checked_in_at?: string
          id?: string
          is_late?: boolean
          method: string
          student_id: string
        }
        Update: {
          attendance_date?: string
          checked_in_at?: string
          id?: string
          is_late?: boolean
          method?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          absent_alert_time: string
          absent_template: string
          admin_pin: string
          arrival_template: string
          id: number
          school_days: number[]
          school_name: string
          school_start_time: string
          template_language: string
          timezone: string
          updated_at: string
        }
        Insert: {
          absent_alert_time?: string
          absent_template?: string
          admin_pin?: string
          arrival_template?: string
          id?: number
          school_days?: number[]
          school_name?: string
          school_start_time?: string
          template_language?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          absent_alert_time?: string
          absent_template?: string
          admin_pin?: string
          arrival_template?: string
          id?: number
          school_days?: number[]
          school_name?: string
          school_start_time?: string
          template_language?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      students: {
        Row: {
          active: boolean
          card_uid: string | null
          class_name: string | null
          created_at: string
          external_id: string | null
          ic_number: string
          id: string
          name: string
          parent_name: string | null
          parent_phone: string | null
          pin: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          card_uid?: string | null
          class_name?: string | null
          created_at?: string
          external_id?: string | null
          ic_number: string
          id?: string
          name: string
          parent_name?: string | null
          parent_phone?: string | null
          pin: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          card_uid?: string | null
          class_name?: string | null
          created_at?: string
          external_id?: string | null
          ic_number?: string
          id?: string
          name?: string
          parent_name?: string | null
          parent_phone?: string | null
          pin?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          created_at: string
          error: string | null
          id: string
          kind: string
          provider_message_id: string | null
          status: string
          status_at: string | null
          student_id: string | null
          to_phone: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          kind: string
          provider_message_id?: string | null
          status?: string
          status_at?: string | null
          student_id?: string | null
          to_phone?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          kind?: string
          provider_message_id?: string | null
          status?: string
          status_at?: string | null
          student_id?: string | null
          to_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_webhook_events: {
        Row: {
          attempts: number
          delivery_id: string
          event: string
          id: string
          payload: Json
          processed_at: string | null
          processing_error: string | null
          received_at: string
        }
        Insert: {
          attempts?: number
          delivery_id: string
          event: string
          id?: string
          payload: Json
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
        }
        Update: {
          attempts?: number
          delivery_id?: string
          event?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
