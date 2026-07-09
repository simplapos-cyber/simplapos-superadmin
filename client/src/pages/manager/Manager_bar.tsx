import { useEffect } from "react";
import { useLocation } from "wouter";
export default function Manager_bar() {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation("/manager"); }, [setLocation]);
  return null;
}
