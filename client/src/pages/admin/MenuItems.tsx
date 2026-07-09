import { useEffect } from "react";
import { useLocation } from "wouter";

// Redirect to MenuManagement with items tab
export default function MenuItems() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/admin/menu");
  }, [setLocation]);
  return null;
}
