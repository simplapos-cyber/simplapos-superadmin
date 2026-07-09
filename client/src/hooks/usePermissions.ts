import { useAuth } from "@/_core/hooks/useAuth";
import {
  type AppRole,
  type Permission,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  getPanelForRole,
} from "../../../shared/permissions";

/**
 * Hook für rollenbasierte Zugriffskontrolle (RBAC).
 * Gibt Hilfsfunktionen zurück, um Berechtigungen zu prüfen.
 */
export function usePermissions() {
  const { user } = useAuth();
  const role = (user?.role ?? "user") as AppRole;

  return {
    role,
    can: (permission: Permission) => hasPermission(role, permission),
    canAny: (permissions: Permission[]) => hasAnyPermission(role, permissions),
    canAll: (permissions: Permission[]) => hasAllPermissions(role, permissions),
    panel: getPanelForRole(role),
    isSuperadmin: role === "superadmin",
    isPartner: role === "partner",
    isAdmin: role === "admin",
    isManager: role === "manager",
    isKellner: role === "kellner",
    isKoch: role === "koch",
    isBar: role === "bar",
    isBuchhalter: role === "buchhalter",
    isGast: role === "gast",
  };
}
