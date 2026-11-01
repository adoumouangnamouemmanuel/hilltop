export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      admin_members: {
        Row: {
          email: string;
          id: string;
          invited_at: string;
          invited_by: string | null;
          last_active_at: string | null;
          name: string;
          profile_id: string | null;
          role_id: string;
          status: Database["public"]["Enums"]["member_status"];
        };
        ComputedFields: never;
        Insert: {
          email: string;
          id?: string;
          invited_at?: string;
          invited_by?: string | null;
          last_active_at?: string | null;
          name: string;
          profile_id?: string | null;
          role_id: string;
          status?: Database["public"]["Enums"]["member_status"];
        };
        Update: {
          email?: string;
          id?: string;
          invited_at?: string;
          invited_by?: string | null;
          last_active_at?: string | null;
          name?: string;
          profile_id?: string | null;
          role_id?: string;
          status?: Database["public"]["Enums"]["member_status"];
        };
        Relationships: [
          {
            foreignKeyName: "admin_members_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admin_members_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admin_members_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "admin_roles";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_roles: {
        Row: {
          created_at: string;
          description: string;
          id: string;
          name: string;
          permissions: string[];
          system: boolean;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          description?: string;
          id: string;
          name: string;
          permissions?: string[];
          system?: boolean;
        };
        Update: {
          created_at?: string;
          description?: string;
          id?: string;
          name?: string;
          permissions?: string[];
          system?: boolean;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          actor_name: string;
          at: string;
          id: number;
          permission: string;
          target: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          actor_name: string;
          at?: string;
          id?: never;
          permission: string;
          target?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          actor_name?: string;
          at?: string;
          id?: never;
          permission?: string;
          target?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      config_draft: {
        Row: {
          config: NonNullable<Json>;
          id: boolean;
          updated_at: string;
          updated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          config: NonNullable<Json>;
          id?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          config?: NonNullable<Json>;
          id?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "config_draft_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      config_releases: {
        Row: {
          changes: string[];
          config: NonNullable<Json>;
          note: string;
          published_at: string;
          published_by: string | null;
          published_by_name: string | null;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          changes?: string[];
          config: NonNullable<Json>;
          note?: string;
          published_at?: string;
          published_by?: string | null;
          published_by_name?: string | null;
          version: number;
        };
        Update: {
          changes?: string[];
          config?: NonNullable<Json>;
          note?: string;
          published_at?: string;
          published_by?: string | null;
          published_by_name?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "config_releases_published_by_fkey";
            columns: ["published_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      conversations: {
        Row: {
          buyer_id: string;
          created_at: string;
          id: string;
          last_message_at: string;
          listing_id: string | null;
          seller_id: string;
        };
        ComputedFields: never;
        Insert: {
          buyer_id: string;
          created_at?: string;
          id?: string;
          last_message_at?: string;
          listing_id?: string | null;
          seller_id: string;
        };
        Update: {
          buyer_id?: string;
          created_at?: string;
          id?: string;
          last_message_at?: string;
          listing_id?: string | null;
          seller_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_buyer_id_fkey";
            columns: ["buyer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      dispute_messages: {
        Row: {
          at: string;
          author_id: string | null;
          body: string;
          dispute_id: string;
          id: string;
          role: string;
        };
        ComputedFields: never;
        Insert: {
          at?: string;
          author_id?: string | null;
          body: string;
          dispute_id: string;
          id?: string;
          role: string;
        };
        Update: {
          at?: string;
          author_id?: string | null;
          body?: string;
          dispute_id?: string;
          id?: string;
          role?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dispute_messages_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dispute_messages_dispute_id_fkey";
            columns: ["dispute_id"];
            isOneToOne: false;
            referencedRelation: "disputes";
            referencedColumns: ["id"];
          },
        ];
      };
      disputes: {
        Row: {
          details: string;
          id: string;
          opened_at: string;
          order_id: string;
          reason: string;
          resolution_note: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          state: Database["public"]["Enums"]["dispute_state"];
        };
        ComputedFields: never;
        Insert: {
          details?: string;
          id?: string;
          opened_at?: string;
          order_id: string;
          reason: string;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          state?: Database["public"]["Enums"]["dispute_state"];
        };
        Update: {
          details?: string;
          id?: string;
          opened_at?: string;
          order_id?: string;
          reason?: string;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          state?: Database["public"]["Enums"]["dispute_state"];
        };
        Relationships: [
          {
            foreignKeyName: "disputes_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: true;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "disputes_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      listing_photos: {
        Row: {
          created_at: string;
          id: string;
          listing_id: string;
          position: number;
          url: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          listing_id: string;
          position?: number;
          url: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          listing_id?: string;
          position?: number;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "listing_photos_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      listings: {
        Row: {
          attributes: NonNullable<Json>;
          category: string;
          condition: string | null;
          created_at: string;
          description: string;
          extra: NonNullable<Json>;
          food: Json | null;
          id: string;
          move_out: boolean;
          original_price: number | null;
          pickup: string;
          posted_at: string;
          price: number;
          promoted_until: string | null;
          saves: number;
          search: unknown;
          seller_id: string;
          status: Database["public"]["Enums"]["listing_status"];
          stock: number | null;
          title: string;
          updated_at: string;
          views: number;
        };
        ComputedFields: never;
        Insert: {
          attributes?: NonNullable<Json>;
          category: string;
          condition?: string | null;
          created_at?: string;
          description?: string;
          extra?: NonNullable<Json>;
          food?: Json | null;
          id?: string;
          move_out?: boolean;
          original_price?: number | null;
          pickup: string;
          posted_at?: string;
          price: number;
          promoted_until?: string | null;
          saves?: number;
          search?: never;
          seller_id: string;
          status?: Database["public"]["Enums"]["listing_status"];
          stock?: number | null;
          title: string;
          updated_at?: string;
          views?: number;
        };
        Update: {
          attributes?: NonNullable<Json>;
          category?: string;
          condition?: string | null;
          created_at?: string;
          description?: string;
          extra?: NonNullable<Json>;
          food?: Json | null;
          id?: string;
          move_out?: boolean;
          original_price?: number | null;
          pickup?: string;
          posted_at?: string;
          price?: number;
          promoted_until?: string | null;
          saves?: number;
          search?: never;
          seller_id?: string;
          status?: Database["public"]["Enums"]["listing_status"];
          stock?: number | null;
          title?: string;
          updated_at?: string;
          views?: number;
        };
        Relationships: [
          {
            foreignKeyName: "listings_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          body: string;
          conversation_id: string;
          created_at: string;
          id: string;
          read_at: string | null;
          sender_id: string;
        };
        ComputedFields: never;
        Insert: {
          body: string;
          conversation_id: string;
          created_at?: string;
          id?: string;
          read_at?: string | null;
          sender_id: string;
        };
        Update: {
          body?: string;
          conversation_id?: string;
          created_at?: string;
          id?: string;
          read_at?: string | null;
          sender_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          body: string;
          created_at: string;
          href: string;
          id: string;
          kind: string;
          profile_id: string;
          read_at: string | null;
          title: string;
        };
        ComputedFields: never;
        Insert: {
          body?: string;
          created_at?: string;
          href?: string;
          id?: string;
          kind: string;
          profile_id: string;
          read_at?: string | null;
          title: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          href?: string;
          id?: string;
          kind?: string;
          profile_id?: string;
          read_at?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      offers: {
        Row: {
          amount: number;
          answered_at: string | null;
          buyer_id: string;
          created_at: string;
          id: string;
          listing_id: string;
          status: Database["public"]["Enums"]["offer_status"];
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          answered_at?: string | null;
          buyer_id: string;
          created_at?: string;
          id?: string;
          listing_id: string;
          status?: Database["public"]["Enums"]["offer_status"];
        };
        Update: {
          amount?: number;
          answered_at?: string | null;
          buyer_id?: string;
          created_at?: string;
          id?: string;
          listing_id?: string;
          status?: Database["public"]["Enums"]["offer_status"];
        };
        Relationships: [
          {
            foreignKeyName: "offers_buyer_id_fkey";
            columns: ["buyer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "offers_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      order_events: {
        Row: {
          actor_id: string | null;
          at: string;
          id: number;
          note: string | null;
          order_id: string;
          status: Database["public"]["Enums"]["order_status"];
        };
        ComputedFields: never;
        Insert: {
          actor_id?: string | null;
          at?: string;
          id?: never;
          note?: string | null;
          order_id: string;
          status: Database["public"]["Enums"]["order_status"];
        };
        Update: {
          actor_id?: string | null;
          at?: string;
          id?: never;
          note?: string | null;
          order_id?: string;
          status?: Database["public"]["Enums"]["order_status"];
        };
        Relationships: [
          {
            foreignKeyName: "order_events_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_events_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          amount: number;
          auto_released: boolean;
          buyer_id: string;
          due_at_pickup: number;
          fee: number;
          handed_over_at: string | null;
          id: string;
          listing_id: string | null;
          listing_title: string;
          paid_in_app: number;
          payment_kind: Database["public"]["Enums"]["payment_kind"];
          pickup: string | null;
          placed_at: string;
          quantity: number;
          seller_id: string;
          slot: string | null;
          status: Database["public"]["Enums"]["order_status"];
          unit_price: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          auto_released?: boolean;
          buyer_id: string;
          due_at_pickup?: number;
          fee?: number;
          handed_over_at?: string | null;
          id?: string;
          listing_id?: string | null;
          listing_title: string;
          paid_in_app?: number;
          payment_kind: Database["public"]["Enums"]["payment_kind"];
          pickup?: string | null;
          placed_at?: string;
          quantity?: number;
          seller_id: string;
          slot?: string | null;
          status?: Database["public"]["Enums"]["order_status"];
          unit_price: number;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          auto_released?: boolean;
          buyer_id?: string;
          due_at_pickup?: number;
          fee?: number;
          handed_over_at?: string | null;
          id?: string;
          listing_id?: string | null;
          listing_title?: string;
          paid_in_app?: number;
          payment_kind?: Database["public"]["Enums"]["payment_kind"];
          pickup?: string | null;
          placed_at?: string;
          quantity?: number;
          seller_id?: string;
          slot?: string | null;
          status?: Database["public"]["Enums"]["order_status"];
          unit_price?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_buyer_id_fkey";
            columns: ["buyer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          claim_email: string | null;
          class_of: number | null;
          created_at: string;
          id: string;
          major: string | null;
          name: string;
          response_time: string | null;
          shop_name: string | null;
          specialty: string | null;
          status: Database["public"]["Enums"]["user_status"];
          updated_at: string;
          user_id: string | null;
          verified: boolean;
        };
        ComputedFields: never;
        Insert: {
          claim_email?: string | null;
          class_of?: number | null;
          created_at?: string;
          id?: string;
          major?: string | null;
          name: string;
          response_time?: string | null;
          shop_name?: string | null;
          specialty?: string | null;
          status?: Database["public"]["Enums"]["user_status"];
          updated_at?: string;
          user_id?: string | null;
          verified?: boolean;
        };
        Update: {
          claim_email?: string | null;
          class_of?: number | null;
          created_at?: string;
          id?: string;
          major?: string | null;
          name?: string;
          response_time?: string | null;
          shop_name?: string | null;
          specialty?: string | null;
          status?: Database["public"]["Enums"]["user_status"];
          updated_at?: string;
          user_id?: string | null;
          verified?: boolean;
        };
        Relationships: [];
      };
      reports: {
        Row: {
          created_at: string;
          details: string;
          handled_at: string | null;
          handled_by: string | null;
          id: string;
          listing_id: string;
          reason: string;
          reporter_id: string;
          status: Database["public"]["Enums"]["report_status"];
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          details?: string;
          handled_at?: string | null;
          handled_by?: string | null;
          id?: string;
          listing_id: string;
          reason: string;
          reporter_id: string;
          status?: Database["public"]["Enums"]["report_status"];
        };
        Update: {
          created_at?: string;
          details?: string;
          handled_at?: string | null;
          handled_by?: string | null;
          id?: string;
          listing_id?: string;
          reason?: string;
          reporter_id?: string;
          status?: Database["public"]["Enums"]["report_status"];
        };
        Relationships: [
          {
            foreignKeyName: "reports_handled_by_fkey";
            columns: ["handled_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_reporter_id_fkey";
            columns: ["reporter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      reviews: {
        Row: {
          author_id: string;
          body: string;
          created_at: string;
          id: string;
          order_id: string;
          rating: number;
          seller_id: string;
          tags: string[];
        };
        ComputedFields: never;
        Insert: {
          author_id: string;
          body?: string;
          created_at?: string;
          id?: string;
          order_id: string;
          rating: number;
          seller_id: string;
          tags?: string[];
        };
        Update: {
          author_id?: string;
          body?: string;
          created_at?: string;
          id?: string;
          order_id?: string;
          rating?: number;
          seller_id?: string;
          tags?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "reviews_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: true;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      saved_listings: {
        Row: {
          created_at: string;
          listing_id: string;
          profile_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          listing_id: string;
          profile_id: string;
        };
        Update: {
          created_at?: string;
          listing_id?: string;
          profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "saved_listings_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "saved_listings_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      saved_searches: {
        Row: {
          alerts: boolean;
          created_at: string;
          id: string;
          label: string;
          profile_id: string;
          query: string;
          seen_ids: string[];
        };
        ComputedFields: never;
        Insert: {
          alerts?: boolean;
          created_at?: string;
          id?: string;
          label: string;
          profile_id: string;
          query: string;
          seen_ids?: string[];
        };
        Update: {
          alerts?: boolean;
          created_at?: string;
          id?: string;
          label?: string;
          profile_id?: string;
          query?: string;
          seen_ids?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "saved_searches_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      current_config: {
        Row: {
          config: NonNullable<Json>;
          published_at: string;
          version: number;
        };
        ComputedFields: never;
        Relationships: [];
      };
      seller_ratings: {
        Row: {
          rating: number | null;
          reviews: number | null;
          seller_id: string;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "reviews_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      my_permissions: { Args: Record<PropertyKey, never>; Returns: string[] };
    };
    Enums: {
      dispute_state: "open" | "withdrawn" | "refunded" | "released";
      listing_status: "draft" | "active" | "sold" | "hidden" | "removed";
      member_status: "invited" | "active";
      offer_status: "pending" | "accepted" | "declined" | "withdrawn";
      order_status: "paid" | "ready" | "collected" | "disputed" | "refunded" | "cancelled";
      payment_kind: "protected" | "deposit" | "pickup";
      report_status: "open" | "dismissed" | "actioned";
      user_status: "active" | "suspended";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      dispute_state: ["open", "withdrawn", "refunded", "released"],
      listing_status: ["draft", "active", "sold", "hidden", "removed"],
      member_status: ["invited", "active"],
      offer_status: ["pending", "accepted", "declined", "withdrawn"],
      order_status: ["paid", "ready", "collected", "disputed", "refunded", "cancelled"],
      payment_kind: ["protected", "deposit", "pickup"],
      report_status: ["open", "dismissed", "actioned"],
      user_status: ["active", "suspended"],
    },
  },
} as const;
