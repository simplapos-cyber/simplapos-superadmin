/**
 * OfflineBanner Komponente
 * Zeigt einen kompakten Hinweis wenn das System offline ist.
 * Verschwindet automatisch wenn Internet zurückkommt.
 * WICHTIG: Kein position:fixed – wird im normalen Dokumentfluss eingebettet,
 * damit keine Navigation blockiert wird.
 */

import { useEffect, useState } from 'react';
import { useOfflineStatus } from '../hooks/useOfflineStatus';
import { countPendingOrders, countPendingPrintJobs } from '../lib/offlineQueue';

interface OfflineBannerProps {
  className?: string;
}

export function OfflineBanner({ className = '' }: OfflineBannerProps) {
  const { isOffline, isOnline, lastOfflineAt } = useOfflineStatus();
  const [pendingOrders, setPendingOrders] = useState(0);
  const [pendingPrints, setPendingPrints] = useState(0);
  const [showReconnected, setShowReconnected] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  // Zähle ausstehende Einträge
  useEffect(() => {
    const update = async () => {
      const orders = await countPendingOrders();
      const prints = await countPendingPrintJobs();
      setPendingOrders(orders);
      setPendingPrints(prints);
    };

    update();
    const interval = setInterval(update, 3000);
    return () => clearInterval(interval);
  }, []);

  // "Wieder verbunden" Banner anzeigen
  useEffect(() => {
    if (isOffline) {
      setWasOffline(true);
    } else if (wasOffline && isOnline) {
      setShowReconnected(true);
      const timer = setTimeout(() => {
        setShowReconnected(false);
        setWasOffline(false);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [isOffline, isOnline, wasOffline]);

  if (!isOffline && !showReconnected) return null;

  // Wieder verbunden – kompakter grüner Streifen
  if (showReconnected && !isOffline) {
    return (
      <div className={`flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white text-xs font-medium ${className}`}
        style={{ minHeight: 28 }}>
        <span>✓</span>
        <span className="font-bold">Wieder online</span>
        {(pendingOrders > 0 || pendingPrints > 0) && (
          <span className="opacity-90">– Synchronisiere...</span>
        )}
      </div>
    );
  }

  // Offline – kompakter roter Streifen
  const sinceTime = lastOfflineAt
    ? lastOfflineAt.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })
    : null;

  const pendingCount = pendingOrders + pendingPrints;

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white text-xs font-medium ${className}`}
      style={{ minHeight: 28 }}
    >
      <span className="animate-pulse">⚡</span>
      <span className="font-bold">Offline</span>
      {sinceTime && (
        <span className="opacity-75">seit {sinceTime}</span>
      )}
      {pendingCount > 0 && (
        <span className="ml-auto bg-red-700 rounded px-1.5 py-0.5 whitespace-nowrap">
          {pendingCount} ausstehend
        </span>
      )}
    </div>
  );
}
