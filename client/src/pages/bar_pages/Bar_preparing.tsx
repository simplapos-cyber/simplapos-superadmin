import { useEffect } from "react";
import { useLocation } from "wouter";
export default function Bar_preparing() {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation("/bar"); }, [setLocation]);
  return null;
}
