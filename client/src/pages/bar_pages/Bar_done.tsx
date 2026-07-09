import { useEffect } from "react";
import { useLocation } from "wouter";
export default function Bar_done() {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation("/bar"); }, [setLocation]);
  return null;
}
