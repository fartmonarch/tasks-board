import { createContext, useContext } from "react";
import type { Session } from "@supabase/supabase-js";

export const AuthSessionContext = createContext<Session | null>(null);

export function useAuthSession() {
  return useContext(AuthSessionContext);
}
