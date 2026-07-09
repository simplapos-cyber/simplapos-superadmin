import { Skeleton } from './ui/skeleton';

export function DashboardLayoutSkeleton() {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar skeleton – hidden on mobile */}
      <div className="hidden md:block w-[280px] border-r border-border bg-card p-4 space-y-6">
        {/* Logo area */}
        <div className="flex items-center gap-3 px-2">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-4 w-24" />
        </div>

        {/* Menu items */}
        <div className="space-y-2 px-2">
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-9 w-3/4 rounded-lg" />
        </div>
      </div>

      {/* Main content skeleton */}
      <div className="flex-1 p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-40 rounded-lg" />
          <Skeleton className="h-8 w-8 rounded-full md:hidden" />
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>

        {/* Chart area */}
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </div>
  );
}
