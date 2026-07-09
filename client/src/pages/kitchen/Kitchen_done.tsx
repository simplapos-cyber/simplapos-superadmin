import { useEffect } from "react";
import { useLocation } from "wouter";
export default function Kitchen_done() {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation("/kueche"); }, [setLocation]);
  return null;
}
