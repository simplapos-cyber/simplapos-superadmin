import { useEffect } from "react";
import { useLocation } from "wouter";

// Redirect to MenuManagement with categories tab
export default function MenuCategories() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/admin/menu");
  }, [setLocation]);
  return null;
}
