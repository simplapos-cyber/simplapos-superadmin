import React, { useRef, useState, useCallback } from "react";
import { Trash2 } from "lucide-react";

interface SwipeableItemProps {
  onDelete: () => void;
  children: React.ReactNode;
  className?: string;
  deleteThreshold?: number; // px to trigger delete (default 80)
}

/**
 * SwipeableItem – wraps any content with a swipe-left-to-delete gesture.
 * - Swipe left > threshold → red delete zone revealed → release triggers onDelete
 * - Haptic feedback on delete
 * - Smooth spring-back animation if not swiped far enough
 * - Does NOT capture pointer so vertical scroll in parent ScrollArea works correctly
 */
export function SwipeableItem({
  onDelete,
  children,
  className = "",
  deleteThreshold = 80,
}: SwipeableItemProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const isHorizontalRef = useRef<boolean | null>(null);
  // Track if we've committed to horizontal swipe (only then prevent default)
  const committedHorizontalRef = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isDeleting) return;
    const touch = e.touches[0];
    startXRef.current = touch.clientX;
    startYRef.current = touch.clientY;
    isHorizontalRef.current = null;
    committedHorizontalRef.current = false;
    setIsDragging(true);
  }, [isDeleting]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging || isDeleting) return;
    const touch = e.touches[0];
    const dx = touch.clientX - startXRef.current;
    const dy = touch.clientY - startYRef.current;

    // Determine scroll direction on first significant move
    if (isHorizontalRef.current === null) {
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
        const horizontal = Math.abs(dx) > Math.abs(dy);
        isHorizontalRef.current = horizontal;
        if (horizontal && dx < 0) {
          // Committed to left swipe – now we can prevent scroll
          committedHorizontalRef.current = true;
        } else {
          // Vertical scroll – abort swipe entirely
          setIsDragging(false);
          setTranslateX(0);
          return;
        }
      }
      return;
    }

    if (!isHorizontalRef.current) return;

    // Only allow left swipe (negative dx)
    if (dx > 0) {
      setTranslateX(0);
      return;
    }

    // Prevent vertical scroll only when committed to horizontal swipe
    if (committedHorizontalRef.current) {
      e.preventDefault();
    }

    // Rubber-band effect: resistance after threshold
    const maxSwipe = deleteThreshold * 1.5;
    const resistance = dx < -deleteThreshold
      ? -deleteThreshold - ((-dx - deleteThreshold) * 0.3)
      : dx;
    setTranslateX(Math.max(resistance, -maxSwipe));
  }, [isDragging, isDeleting, deleteThreshold]);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    committedHorizontalRef.current = false;

    if (translateX < -deleteThreshold) {
      // Trigger delete
      setIsDeleting(true);
      if (navigator.vibrate) navigator.vibrate([30, 20, 50]);
      // Animate out to the left
      setTranslateX(-300);
      setTimeout(() => {
        onDelete();
      }, 220);
    } else {
      // Spring back
      setTranslateX(0);
    }
  }, [isDragging, translateX, deleteThreshold, onDelete]);

  const deleteProgress = Math.min(1, Math.abs(translateX) / deleteThreshold);
  const showDelete = translateX < -20;

  return (
    <div
      className={`relative overflow-hidden rounded-xl ${className}`}
      // Allow pan-y always so parent ScrollArea can scroll vertically
      style={{ touchAction: "pan-y" }}
    >
      {/* Delete background */}
      <div
        className="absolute inset-0 flex items-center justify-end pr-4 rounded-xl"
        style={{
          background: `rgba(239, 68, 68, ${0.7 + deleteProgress * 0.3})`,
          opacity: showDelete ? 1 : 0,
          transition: isDragging ? "none" : "opacity 0.2s",
        }}
      >
        <div
          style={{
            transform: `scale(${0.7 + deleteProgress * 0.3})`,
            transition: isDragging ? "none" : "transform 0.2s",
          }}
        >
          <Trash2 className="h-5 w-5 text-white" />
        </div>
      </div>

      {/* Swipeable content */}
      <div
        ref={containerRef}
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isDragging ? "none" : "transform 0.25s cubic-bezier(0.23, 1, 0.32, 1)",
          willChange: "transform",
          position: "relative",
          zIndex: 1,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
