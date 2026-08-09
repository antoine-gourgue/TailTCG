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
    PostgrestVersion: "14.15"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      binder_items: {
        Row: {
          added_at: string | null
          binder_id: string
          item_id: string
          owner_id: string
          position: number | null
        }
        Insert: {
          added_at?: string | null
          binder_id: string
          item_id: string
          owner_id?: string
          position?: number | null
        }
        Update: {
          added_at?: string | null
          binder_id?: string
          item_id?: string
          owner_id?: string
          position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "binder_items_binder_id_fkey"
            columns: ["binder_id"]
            isOneToOne: false
            referencedRelation: "binders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "binder_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "collection_value"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "binder_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      binders: {
        Row: {
          color: string | null
          cover_item_ids: string[] | null
          created_at: string | null
          id: string
          name: string
          owner_id: string
          position: number | null
          style: string | null
        }
        Insert: {
          color?: string | null
          cover_item_ids?: string[] | null
          created_at?: string | null
          id?: string
          name: string
          owner_id?: string
          position?: number | null
          style?: string | null
        }
        Update: {
          color?: string | null
          cover_item_ids?: string[] | null
          created_at?: string | null
          id?: string
          name?: string
          owner_id?: string
          position?: number | null
          style?: string | null
        }
        Relationships: []
      }
      custom_cards: {
        Row: {
          created_at: string | null
          id: string
          image_path: string
          local_id: string
          name: string
          owner_id: string
          set_name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          image_path: string
          local_id: string
          name: string
          owner_id?: string
          set_name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          image_path?: string
          local_id?: string
          name?: string
          owner_id?: string
          set_name?: string
        }
        Relationships: []
      }
      item_photos: {
        Row: {
          created_at: string | null
          id: string
          item_id: string
          label: string | null
          owner_id: string
          path: string
          position: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          item_id: string
          label?: string | null
          owner_id?: string
          path: string
          position?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          item_id?: string
          label?: string | null
          owner_id?: string
          path?: string
          position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "item_photos_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "collection_value"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_photos_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      item_value_history: {
        Row: {
          id: string
          item_id: string
          owner_id: string
          recorded_at: string
          value: number
        }
        Insert: {
          id?: string
          item_id: string
          owner_id?: string
          recorded_at?: string
          value: number
        }
        Update: {
          id?: string
          item_id?: string
          owner_id?: string
          recorded_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "item_value_history_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "collection_value"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_value_history_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          card_name: string
          card_type: string | null
          cardmarket_url: string | null
          condition: string
          created_at: string | null
          grade: string | null
          graded: boolean | null
          id: string
          image_url: string
          language: string
          local_id: string
          manual_price: number | null
          notes: string | null
          owner_id: string
          purchase_date: string | null
          purchase_price: number | null
          quantity: number
          set_id: string
          set_name: string
          sold_at: string | null
          sold_price: number | null
          source_id: string | null
          tcgdex_id: string
        }
        Insert: {
          card_name: string
          card_type?: string | null
          cardmarket_url?: string | null
          condition: string
          created_at?: string | null
          grade?: string | null
          graded?: boolean | null
          id?: string
          image_url: string
          language?: string
          local_id: string
          manual_price?: number | null
          notes?: string | null
          owner_id?: string
          purchase_date?: string | null
          purchase_price?: number | null
          quantity?: number
          set_id: string
          set_name: string
          sold_at?: string | null
          sold_price?: number | null
          source_id?: string | null
          tcgdex_id: string
        }
        Update: {
          card_name?: string
          card_type?: string | null
          cardmarket_url?: string | null
          condition?: string
          created_at?: string | null
          grade?: string | null
          graded?: boolean | null
          id?: string
          image_url?: string
          language?: string
          local_id?: string
          manual_price?: number | null
          notes?: string | null
          owner_id?: string
          purchase_date?: string | null
          purchase_price?: number | null
          quantity?: number
          set_id?: string
          set_name?: string
          sold_at?: string | null
          sold_price?: number | null
          source_id?: string | null
          tcgdex_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      price_snapshots: {
        Row: {
          avg30: number | null
          captured_at: string
          low: number | null
          tcgdex_id: string
          trend: number | null
        }
        Insert: {
          avg30?: number | null
          captured_at?: string
          low?: number | null
          tcgdex_id: string
          trend?: number | null
        }
        Update: {
          avg30?: number | null
          captured_at?: string
          low?: number | null
          tcgdex_id?: string
          trend?: number | null
        }
        Relationships: []
      }
      sources: {
        Row: {
          address: string | null
          city: string | null
          created_at: string | null
          id: string
          kind: string
          lat: number | null
          lng: number | null
          name: string
          notes: string | null
          owner_id: string
          url: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string | null
          id?: string
          kind: string
          lat?: number | null
          lng?: number | null
          name: string
          notes?: string | null
          owner_id?: string
          url?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string | null
          id?: string
          kind?: string
          lat?: number | null
          lng?: number | null
          name?: string
          notes?: string | null
          owner_id?: string
          url?: string | null
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          display_name: string | null
          owner_id: string
          revalue_weeks: number | null
          share_token: string | null
          updated_at: string | null
        }
        Insert: {
          display_name?: string | null
          owner_id?: string
          revalue_weeks?: number | null
          share_token?: string | null
          updated_at?: string | null
        }
        Update: {
          display_name?: string | null
          owner_id?: string
          revalue_weeks?: number | null
          share_token?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      wishlist: {
        Row: {
          card_name: string
          created_at: string | null
          id: string
          image_url: string
          local_id: string
          owner_id: string
          set_id: string
          set_name: string
          tcgdex_id: string
        }
        Insert: {
          card_name: string
          created_at?: string | null
          id?: string
          image_url?: string
          local_id: string
          owner_id?: string
          set_id: string
          set_name: string
          tcgdex_id: string
        }
        Update: {
          card_name?: string
          created_at?: string | null
          id?: string
          image_url?: string
          local_id?: string
          owner_id?: string
          set_id?: string
          set_name?: string
          tcgdex_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      collection_value: {
        Row: {
          card_name: string | null
          card_type: string | null
          cardmarket_url: string | null
          condition: string | null
          created_at: string | null
          current_price: number | null
          gain: number | null
          grade: string | null
          graded: boolean | null
          id: string | null
          image_url: string | null
          language: string | null
          local_id: string | null
          manual_price: number | null
          market_trend: number | null
          notes: string | null
          owner_id: string | null
          purchase_date: string | null
          purchase_price: number | null
          quantity: number | null
          set_id: string | null
          set_name: string | null
          sold_at: string | null
          sold_price: number | null
          source_id: string | null
          tcgdex_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "items_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
