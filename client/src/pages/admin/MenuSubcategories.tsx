import { useEffect } from "react";
import { useLocation } from "wouter";

export default function MenuSubcategories() {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation("/admin/menu"); }, [setLocation]);
  return null;
}
