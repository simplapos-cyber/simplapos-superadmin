import { useEffect } from "react";
import { useLocation } from "wouter";
export default function Kitchen_preparing() {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation("/kueche"); }, [setLocation]);
  return null;
}
