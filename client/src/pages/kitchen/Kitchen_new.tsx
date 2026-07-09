import { useEffect } from "react";
import { useLocation } from "wouter";
export default function Kitchen_new() {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation("/kueche"); }, [setLocation]);
  return null;
}
