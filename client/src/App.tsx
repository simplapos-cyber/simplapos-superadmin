import { Route, Switch, Redirect } from "wouter";
import { Toaster } from "@/components/ui/sonner";
import { lazy, Suspense } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import KellnerLayout from "@/components/KellnerLayout";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/_core/hooks/useAuth";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { SessionConflictOverlay } from "@/components/SessionConflictOverlay";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";
import { WaiterPinProvider, useWaiterPin } from "@/contexts/WaiterPinContext";

// ─── LAZY-LOADED PAGES (Code-Splitting for stability) ───────────────────────
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const GuestDashboard = lazy(() => import("@/pages/GuestDashboard"));
const Rewards = lazy(() => import("@/pages/Rewards"));
const MyInvoices = lazy(() => import("@/pages/MyInvoices"));
const Restaurants = lazy(() => import("@/pages/Restaurants"));
const RestaurantDetail = lazy(() => import("@/pages/RestaurantDetail"));
const Users = lazy(() => import("@/pages/Users"));
const Chat = lazy(() => import("@/pages/Chat"));
const Advertisements = lazy(() => import("@/pages/Advertisements"));
const Reviews = lazy(() => import("@/pages/Reviews"));
const Contracts = lazy(() => import("@/pages/Contracts"));
const Invoices = lazy(() => import("@/pages/Invoices"));
const MediaLibrary = lazy(() => import("@/pages/MediaLibrary"));
const Profile = lazy(() => import("@/pages/Profile"));
const Login = lazy(() => import("@/pages/Login"));
const Register = lazy(() => import("@/pages/Register"));
const LandingPage = lazy(() => import("@/pages/LandingPage"));
const InstallApp = lazy(() => import("@/pages/InstallApp"));
const OnboardingWizard = lazy(() => import("@/pages/OnboardingWizard"));
const VerifyEmail = lazy(() => import("@/pages/VerifyEmail"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const PartnerPortal = lazy(() => import("@/pages/PartnerPortal"));
const ContractWizard = lazy(() => import("@/pages/ContractWizard"));
const Subscriptions = lazy(() => import("@/pages/Subscriptions"));
const Hardware = lazy(() => import("@/pages/Hardware"));
const ActivateAccount = lazy(() => import("@/pages/ActivateAccount"));
const SubscriptionSuccess = lazy(() => import("@/pages/SubscriptionSuccess"));
const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
const AdminStaff = lazy(() => import("@/pages/admin/AdminStaff"));
const AdminTables = lazy(() => import("@/pages/admin/AdminTables"));
const AdminModules = lazy(() => import("@/pages/admin/AdminModules"));
const AdminSettings = lazy(() => import("@/pages/admin/AdminSettings"));
const FloorPlanDesigner = lazy(() => import("@/pages/admin/FloorPlanDesigner"));
const MenuManagement = lazy(() => import("@/pages/admin/MenuManagement"));
const MenuBuilder = lazy(() => import("@/pages/admin/MenuBuilder"));
const OrderView = lazy(() => import("@/pages/admin/OrderView"));
const NotFound = lazy(() => import("@/pages/NotFound"));

// ─── NEW ROLE-SPECIFIC PAGES ─────────────────────────────────────────────────
// Superadmin extras
const RolesPermissions = lazy(() => import("@/pages/superadmin/RolesPermissions"));
const AuditLogs = lazy(() => import("@/pages/superadmin/AuditLogs"));
const ActivityLogs = lazy(() => import("@/pages/superadmin/ActivityLogs"));
const SystemMonitor = lazy(() => import("@/pages/superadmin/SystemMonitor"));
const SystemSettings = lazy(() => import("@/pages/superadmin/SystemSettings"));
const LocalConnectPage = lazy(() => import("@/pages/superadmin/LocalConnect"));
const BackupsPage = lazy(() => import("@/pages/superadmin/Backups"));
const QrorpaStatistiken = lazy(() => import("@/pages/superadmin/QrorpaStatistiken"));
const CountryConfigPage = lazy(() => import("@/pages/superadmin/CountryConfig"));
// Partner extras
const PartnerCustomers = lazy(() => import("@/pages/partner/PartnerCustomers"));
const PartnerCommissions = lazy(() => import("@/pages/partner/PartnerCommissions"));
const PartnerLeads = lazy(() => import("@/pages/partner/PartnerLeads"));
const PartnerStatistics = lazy(() => import("@/pages/partner/PartnerStatistics"));
// Admin extras
const AdminReservations = lazy(() => import("@/pages/admin/AdminReservations"));
const AdminTakeaway = lazy(() => import("@/pages/admin/AdminTakeaway"));
const AdminVouchers = lazy(() => import("@/pages/admin/AdminVouchers"));
const AdminLoyalty = lazy(() => import("@/pages/admin/AdminLoyalty"));
const AdminClosings = lazy(() => import("@/pages/admin/AdminClosings"));
const Reports = lazy(() => import("@/pages/Reports"));
const AdminInventory = lazy(() => import("@/pages/admin/AdminInventory"));
const AdminInventoryPlanning = lazy(() => import("@/pages/admin/AdminInventoryPlanning"));
const AdminInventoryRecipes = lazy(() => import("@/pages/admin/AdminInventoryRecipes"));
const AdminWarehouse = lazy(() => import("@/pages/admin/AdminWarehouse"));
const AdminDevices = lazy(() => import("@/pages/admin/AdminDevices"));
const AdminPaymentMethods = lazy(() => import("@/pages/admin/AdminPaymentMethods"));
// Smart Building / IoT
const SmartBuilding = lazy(() => import("@/pages/admin/SmartBuilding"));
const SmartBuildingTemperature = lazy(() => import("@/pages/admin/SmartBuildingTemperature"));
const SmartBuildingAlerts = lazy(() => import("@/pages/admin/SmartBuildingAlerts"));
// New modules
const Kassenbuch = lazy(() => import("@/pages/admin/Kassenbuch"));
const Steuerexport = lazy(() => import("@/pages/admin/Steuerexport"));
const Naehrwerte = lazy(() => import("@/pages/admin/Naehrwerte"));
const MehrsprachigeSpeisekarte = lazy(() => import("@/pages/admin/MehrsprachigeSpeisekarte"));
const Bewertungen = lazy(() => import("@/pages/admin/Bewertungen"));
// Manager
const ManagerDashboard = lazy(() => import("@/pages/manager/ManagerDashboard"));
const ManagerStatistics = lazy(() => import("@/pages/manager/ManagerStatistics"));
const ManagerShifts = lazy(() => import("@/pages/manager/ManagerShifts"));
// Kellner
const KellnerDashboard = lazy(() => import("@/pages/kellner/KellnerDashboard"));
// Küche
const KuecheDashboard = lazy(() => import("@/pages/kueche/KuecheDashboard"));
// Bar
const BarDashboard = lazy(() => import("@/pages/bar/BarDashboard"));
// Buchhalter / Gast
const BuchhalterDashboard = lazy(() => import("@/pages/buchhalter/BuchhalterDashboard"));
const GastDashboard = lazy(() => import("@/pages/gast/GastDashboard"));

// ─── NEW PAGES (404-Fix) ─────────────────────────────────────────────────────
// Admin neue Seiten
const AdminStatistics = lazy(() => import("@/pages/admin/AdminStatistics"));
const AdminMarketing = lazy(() => import("@/pages/admin/AdminMarketing"));
const AdminPrinters = lazy(() => import("@/pages/admin/AdminPrinters"));
const AdminLocalConnect = lazy(() => import("@/pages/admin/AdminLocalConnect"));
const AdminSumup = lazy(() => import("@/pages/admin/AdminSumup"));
const AdminPaytec = lazy(() => import("@/pages/admin/AdminPaytec"));
const AdminNexi = lazy(() => import("@/pages/admin/AdminNexi"));
const AdminDelivery = lazy(() => import("@/pages/admin/AdminDelivery"));
const AdminInvoices = lazy(() => import("@/pages/admin/AdminInvoices"));
const AdminOrders = lazy(() => import("@/pages/admin/AdminOrders"));
const AdminInvoicing = lazy(() => import("@/pages/admin/AdminInvoicing"));
const AdminRecurringInvoices = lazy(() => import("@/pages/admin/AdminRecurringInvoices"));
const AdminDebtors = lazy(() => import("@/pages/admin/AdminDebtors"));
const AdminShifts = lazy(() => import("@/pages/admin/AdminShifts"));
const AdminAbsences = lazy(() => import("@/pages/admin/AdminAbsences"));
const AdminShiftSwap = lazy(() => import("@/pages/admin/AdminShiftSwap"));
const AiPlanning = lazy(() => import("@/pages/admin/AiPlanning"));
const VoucherPrintPage = lazy(() => import("@/pages/admin/VoucherPrintPage"));
const MenuCategories = lazy(() => import("@/pages/admin/MenuCategories"));
const MenuItems = lazy(() => import("@/pages/admin/MenuItems"));
const MenuSubcategories = lazy(() => import("@/pages/admin/MenuSubcategories"));
const MenuVariants = lazy(() => import("@/pages/admin/MenuVariants"));
const AdminMenuModifiers = lazy(() => import("@/pages/admin/AdminMenuModifiers"));
const AdminMenuSets = lazy(() => import("@/pages/admin/AdminMenuSets"));
const AdminMenuKiImport = lazy(() => import("@/pages/admin/AdminMenuKiImport"));
// Accounting (Buchhalter Unterseiten)
const BuchhalterRevenue = lazy(() => import("@/pages/accounting/BuchhalterRevenue"));
const BuchhalterClosings = lazy(() => import("@/pages/accounting/BuchhalterClosings"));
const BuchhalterVat = lazy(() => import("@/pages/accounting/BuchhalterVat"));
const BuchhalterInvoices = lazy(() => import("@/pages/accounting/BuchhalterInvoices"));
const BuchhalterPaymentMethods = lazy(() => import("@/pages/accounting/BuchhalterPaymentMethods"));
const BuchhalterCancellations = lazy(() => import("@/pages/accounting/BuchhalterCancellations"));
const BuchhalterExport = lazy(() => import("@/pages/accounting/BuchhalterExport"));
// Kitchen Unterseiten
const KuecheCheckIn = lazy(() => import("@/pages/kueche/KuecheCheckIn"));
const KitchenNew = lazy(() => import("@/pages/kitchen/Kitchen_new"));
const KitchenPreparing = lazy(() => import("@/pages/kitchen/Kitchen_preparing"));
const KitchenReady = lazy(() => import("@/pages/kitchen/Kitchen_ready"));
const KitchenDone = lazy(() => import("@/pages/kitchen/Kitchen_done"));
// Bar Unterseiten
const BarNew = lazy(() => import("@/pages/bar_pages/Bar_new"));
const BarPreparing = lazy(() => import("@/pages/bar_pages/Bar_preparing"));
const BarReady = lazy(() => import("@/pages/bar_pages/Bar_ready"));
const BarDone = lazy(() => import("@/pages/bar_pages/Bar_done"));
// Guest Unterseiten
const GuestLoyalty = lazy(() => import("@/pages/guest/GuestLoyalty"));
const GuestGiftcards = lazy(() => import("@/pages/guest/GuestGiftcards"));
const GuestInvoices = lazy(() => import("@/pages/guest/GuestInvoices"));
const GuestQrOrders = lazy(() => import("@/pages/guest/GuestQrOrders"));
const GuestOrderStatus = lazy(() => import("@/pages/guest/GuestOrderStatus"));
const GuestOrderPage = lazy(() => import("@/pages/guest/GuestOrder"));
const GiftCardBalance = lazy(() => import("@/pages/guest/GiftCardBalance"));
const GiftCardPurchaseSuccess = lazy(() => import("@/pages/guest/GiftCardPurchaseSuccess"));
const GiftCardBuyPage = lazy(() => import("@/pages/guest/GiftCardBuyPage"));
const QrManagement = lazy(() => import("@/pages/admin/QrManagement"));
const GangKonfiguration = lazy(() => import("@/pages/admin/GangKonfiguration"));
const AbrufVerlauf = lazy(() => import("@/pages/admin/AbrufVerlauf"));
const NfcLogin = lazy(() => import("@/pages/NfcLogin"));
const WarehouseQrScan = lazy(() => import("@/pages/guest/WarehouseQrScan"));
// Manager Unterseiten
const ManagerAvailability = lazy(() => import("@/pages/manager/Manager_availability"));
const ManagerBar = lazy(() => import("@/pages/manager/Manager_bar"));
const ManagerDelivery = lazy(() => import("@/pages/manager/Manager_delivery"));
const ManagerFloorPlan = lazy(() => import("@/pages/manager/Manager_floor_plan"));
const ManagerKitchen = lazy(() => import("@/pages/manager/Manager_kitchen"));
const ManagerOrders = lazy(() => import("@/pages/manager/Manager_orders"));
const ManagerReservations = lazy(() => import("@/pages/manager/Manager_reservations"));
const ManagerRevenue = lazy(() => import("@/pages/manager/Manager_revenue"));
const ManagerStaff = lazy(() => import("@/pages/manager/Manager_staff"));
const ManagerTakeaway = lazy(() => import("@/pages/manager/Manager_takeaway"));
// Waiter Unterseiten
const WaiterCart = lazy(() => import("@/pages/waiter/Waiter_cart"));
const WaiterCheckout = lazy(() => import("@/pages/waiter/Waiter_checkout"));
const WaiterHistory = lazy(() => import("@/pages/waiter/Waiter_history"));
const WaiterOrders = lazy(() => import("@/pages/waiter/Waiter_orders"));
const WaiterReady = lazy(() => import("@/pages/waiter/Waiter_ready"));
const WaiterRevenue = lazy(() => import("@/pages/waiter/Waiter_revenue"));
const WaiterShift = lazy(() => import("@/pages/waiter/Waiter_shift"));
const WaiterAbsences = lazy(() => import("@/pages/waiter/WaiterAbsences"));
const WaiterPlannedShifts = lazy(() => import("@/pages/waiter/WaiterPlannedShifts"));
const WaiterShiftSwap = lazy(() => import("@/pages/waiter/WaiterShiftSwap"));
const WaiterSplit = lazy(() => import("@/pages/waiter/Waiter_split"));
const WaiterTables = lazy(() => import("@/pages/waiter/Waiter_tables"));
const WaiterCalendar = lazy(() => import("@/pages/waiter/WaiterCalendar"));
const WaiterInvoices = lazy(() => import("@/pages/waiter/WaiterInvoices"));
const KioskAdmin = lazy(() => import("@/pages/admin/KioskAdmin"));
const KioskMonitor = lazy(() => import("@/pages/admin/KioskMonitor"));
const KioskStats = lazy(() => import("@/pages/admin/KioskStats"));
const AgeVerificationPanel = lazy(() => import("@/pages/waiter/AgeVerificationPanel"));
const KioskGuestPage = lazy(() => import("@/pages/kiosk/KioskGuestPage"));

// ─── PAGE LOADING FALLBACK ──────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    </div>
  );
}

// ─── ROUTE ERROR BOUNDARY ───────────────────────────────────────────────────
// Wraps each route so a crash in one page doesn't take down the whole app
function SafePage({ children, name }: { children: React.ReactNode; name?: string }) {
  return (
    <ErrorBoundary name={name || "page"}>
      <Suspense fallback={<PageLoader />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

function ProtectedRoutes() {
  const { user } = useAuth();
  const isSuperadmin = user?.role === "superadmin";
  const isAdmin = user?.role === "superadmin" || user?.role === "admin";
  const isStaff = isAdmin || user?.role === "kellner" || user?.role === "koch" || user?.role === "buchhalter";
  const isPartner = user?.role === "partner";
  const isRestaurantAdmin = user?.role === "admin" && !!user?.restaurantId;
  const isManager = user?.role === "manager" || isAdmin;
  const isKellner = user?.role === "kellner" || isManager;
  const isKoch = user?.role === "koch" || isManager;
  const isBar = user?.role === "barkeeper" || isManager;
  const isBuchhalter = user?.role === "buchhalter" || isAdmin;
  const isGast = user?.role === "gast" || isAdmin;

  return (
    <Switch>
      <Route path="/">
        {isPartner ? <Redirect to="/partner" />
          : isRestaurantAdmin ? <Redirect to="/admin" />
          : isKellner && !isAdmin ? <Redirect to="/kellner" />
          : isKoch && !isAdmin ? <Redirect to="/kueche" />
          : isBar && !isAdmin ? <Redirect to="/bar" />
          : isBuchhalter && !isAdmin ? <Redirect to="/buchhalter" />
          : <Redirect to="/dashboard" />}
      </Route>
      <Route path="/dashboard">
        <SafePage>
          {isRestaurantAdmin ? <Redirect to="/admin" />
            : isSuperadmin ? <Dashboard />
            : isPartner ? <Redirect to="/partner" />
            : isKellner && !isAdmin ? <Redirect to="/kellner" />
            : isKoch && !isAdmin ? <Redirect to="/kueche" />
            : isBar && !isAdmin ? <Redirect to="/bar" />
            : isBuchhalter && !isAdmin ? <Redirect to="/buchhalter" />
            : <GuestDashboard />}
        </SafePage>
      </Route>

      {/* Restaurant Admin routes */}
      {isRestaurantAdmin && <Route path="/admin/staff">{() => <SafePage><AdminStaff /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/tables">{() => <SafePage><AdminTables /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/floor-plan">{() => <SafePage><FloorPlanDesigner /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/menu">{() => <SafePage><MenuManagement /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/menu-builder">{() => <SafePage><MenuBuilder /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/menu/modifiers">{() => <SafePage><AdminMenuModifiers /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/menu/sets">{() => <SafePage><AdminMenuSets /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/menu/ki-import">{() => <SafePage><AdminMenuKiImport /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/order">{() => <SafePage><OrderView /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/betrieb">{() => <SafePage><OrderView /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/modules">{() => <SafePage><AdminModules /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/settings">{() => <SafePage><AdminSettings /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/reservations">{() => <SafePage><AdminReservations /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/takeaway">{() => <SafePage><AdminTakeaway /></SafePage>}</Route>}
      {(isRestaurantAdmin || isKellner) && <Route path="/admin/vouchers/:id/print">{(params) => <SafePage><VoucherPrintPage /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/vouchers">{() => <SafePage><AdminVouchers /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/loyalty">{() => <SafePage><AdminLoyalty /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/closings">{() => <SafePage><AdminClosings /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/reports">{() => <SafePage><Reports /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/inventory/planning">{() => <SafePage><AdminInventoryPlanning /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/inventory/recipes">{() => <SafePage><AdminInventoryRecipes /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/inventory">{() => <SafePage><AdminInventory /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/warehouse/:tab?">{() => <SafePage><AdminWarehouse /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/smart-building/temperature">{() => <SafePage><SmartBuildingTemperature /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/smart-building/alerts">{() => <SafePage><SmartBuildingAlerts /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/smart-building">{() => <SafePage><SmartBuilding /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/devices">{() => <SafePage><AdminDevices /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/payment-methods">{() => <SafePage><AdminPaymentMethods /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/kassenbuch">{() => <SafePage><Kassenbuch /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/steuerexport">{() => <SafePage><Steuerexport /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/naehrwerte">{() => <SafePage><Naehrwerte /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/mehrsprachige-speisekarte">{() => <SafePage><MehrsprachigeSpeisekarte /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/bewertungen">{() => <SafePage><Bewertungen /></SafePage>}</Route>}
      {/* Admin 404-Fix neue Routen */}
      {isRestaurantAdmin && <Route path="/admin/statistics">{() => <SafePage><AdminStatistics /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/marketing">{() => <SafePage><AdminMarketing /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/printers">{() => <SafePage><AdminPrinters /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/local-connect">{() => <SafePage><AdminLocalConnect /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/sumup">{() => <SafePage><AdminSumup /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/paytec">{() => <SafePage><AdminPaytec /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/nexi">{() => <SafePage><AdminNexi /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/delivery">{() => <SafePage><AdminDelivery /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/invoices">{() => <SafePage><AdminInvoices /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/invoicing">{() => <SafePage><AdminInvoicing /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/recurring-invoices">{() => <SafePage><AdminRecurringInvoices /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/debtors">{() => <SafePage><AdminDebtors /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/orders">{() => <SafePage><AdminOrders /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/shifts">{() => <SafePage><AdminShifts /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/absences">{() => <SafePage><AdminAbsences /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/shift-swap">{() => <SafePage><AdminShiftSwap /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/ai-planning">{() => <SafePage><AiPlanning /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/qr-management">{() => <SafePage><QrManagement /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/gang-konfiguration">{() => <SafePage><GangKonfiguration /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/abruf-verlauf">{() => <SafePage><AbrufVerlauf /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/menu/categories">{() => <SafePage><MenuCategories /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/menu/items">{() => <SafePage><MenuItems /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/menu/subcategories">{() => <SafePage><MenuSubcategories /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/menu/variants">{() => <SafePage><MenuVariants /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/kiosk/stats">{() => <SafePage><KioskStats /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/kiosk/monitor">{() => <SafePage><KioskMonitor /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/kiosk/age-verification">{() => <SafePage><AgeVerificationPanel /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin/kiosk">{() => <SafePage><KioskAdmin /></SafePage>}</Route>}
      {isRestaurantAdmin && <Route path="/admin">{() => <SafePage><AdminDashboard /></SafePage>}</Route>}

      {/* Manager routes */}
      {isManager && <Route path="/manager/statistics">{() => <SafePage><ManagerStatistics /></SafePage>}</Route>}
      {isManager && <Route path="/manager/shifts">{() => <SafePage><ManagerShifts /></SafePage>}</Route>}
      {isManager && <Route path="/manager/availability">{() => <SafePage><ManagerAvailability /></SafePage>}</Route>}
      {isManager && <Route path="/manager/bar">{() => <SafePage><ManagerBar /></SafePage>}</Route>}
      {isManager && <Route path="/manager/delivery">{() => <SafePage><ManagerDelivery /></SafePage>}</Route>}
      {isManager && <Route path="/manager/floor-plan">{() => <SafePage><ManagerFloorPlan /></SafePage>}</Route>}
      {isManager && <Route path="/manager/kitchen">{() => <SafePage><ManagerKitchen /></SafePage>}</Route>}
      {isManager && <Route path="/manager/orders">{() => <SafePage><ManagerOrders /></SafePage>}</Route>}
      {isManager && <Route path="/manager/reservations">{() => <SafePage><ManagerReservations /></SafePage>}</Route>}
      {isManager && <Route path="/manager/revenue">{() => <SafePage><ManagerRevenue /></SafePage>}</Route>}
      {isManager && <Route path="/manager/staff">{() => <SafePage><ManagerStaff /></SafePage>}</Route>}
      {isManager && <Route path="/manager/takeaway">{() => <SafePage><ManagerTakeaway /></SafePage>}</Route>}
      {isManager && <Route path="/manager">{() => <SafePage><ManagerDashboard /></SafePage>}</Route>}

      {/* Kellner-Routen werden jetzt in KellnerRoutes/KellnerLayout gerendert */}

      {/* Küche routes */}
      {isKoch && <Route path="/kueche/checkin">{() => <SafePage><KuecheCheckIn /></SafePage>}</Route>}
      {isKoch && <Route path="/kueche/new">{() => <SafePage><KitchenNew /></SafePage>}</Route>}
      {isKoch && <Route path="/kueche/preparing">{() => <SafePage><KitchenPreparing /></SafePage>}</Route>}
      {isKoch && <Route path="/kueche/ready">{() => <SafePage><KitchenReady /></SafePage>}</Route>}
      {isKoch && <Route path="/kueche/done">{() => <SafePage><KitchenDone /></SafePage>}</Route>}
      {isKoch && <Route path="/kueche">{() => <SafePage><KuecheDashboard /></SafePage>}</Route>}

      {/* Bar routes */}
      {isBar && <Route path="/bar/new">{() => <SafePage><BarNew /></SafePage>}</Route>}
      {isBar && <Route path="/bar/preparing">{() => <SafePage><BarPreparing /></SafePage>}</Route>}
      {isBar && <Route path="/bar/ready">{() => <SafePage><BarReady /></SafePage>}</Route>}
      {isBar && <Route path="/bar/done">{() => <SafePage><BarDone /></SafePage>}</Route>}
      {isBar && <Route path="/bar">{() => <SafePage><BarDashboard /></SafePage>}</Route>}

      {/* Buchhalter routes */}
      {isBuchhalter && <Route path="/buchhalter/revenue">{() => <SafePage><BuchhalterRevenue /></SafePage>}</Route>}
      {isBuchhalter && <Route path="/buchhalter/closings">{() => <SafePage><BuchhalterClosings /></SafePage>}</Route>}
      {isBuchhalter && <Route path="/buchhalter/vat">{() => <SafePage><BuchhalterVat /></SafePage>}</Route>}
      {isBuchhalter && <Route path="/buchhalter/invoices">{() => <SafePage><BuchhalterInvoices /></SafePage>}</Route>}
      {isBuchhalter && <Route path="/buchhalter/payment-methods">{() => <SafePage><BuchhalterPaymentMethods /></SafePage>}</Route>}
      {isBuchhalter && <Route path="/buchhalter/cancellations">{() => <SafePage><BuchhalterCancellations /></SafePage>}</Route>}
      {isBuchhalter && <Route path="/buchhalter/export">{() => <SafePage><BuchhalterExport /></SafePage>}</Route>}
      {isBuchhalter && <Route path="/buchhalter">{() => <SafePage><BuchhalterDashboard /></SafePage>}</Route>}

      {/* Gast routes */}
      {isGast && <Route path="/gast/loyalty">{() => <SafePage><GuestLoyalty /></SafePage>}</Route>}
      {isGast && <Route path="/gast/giftcards">{() => <SafePage><GuestGiftcards /></SafePage>}</Route>}
      {isGast && <Route path="/gast/invoices">{() => <SafePage><GuestInvoices /></SafePage>}</Route>}
      {isGast && <Route path="/gast/qr-orders">{() => <SafePage><GuestQrOrders /></SafePage>}</Route>}
      {isGast && <Route path="/gast/order-status">{() => <SafePage><GuestOrderStatus /></SafePage>}</Route>}
      {isGast && <Route path="/gast">{() => <SafePage><GastDashboard /></SafePage>}</Route>}

      <Route path="/profile">{() => <SafePage><Profile /></SafePage>}</Route>
      <Route path="/rewards">{() => <SafePage><Rewards /></SafePage>}</Route>
      <Route path="/my-invoices">{() => <SafePage><MyInvoices /></SafePage>}</Route>
      <Route path="/chat">{() => <SafePage><Chat /></SafePage>}</Route>

      {/* Partner routes */}
      {(isPartner || isAdmin) && <Route path="/partner/:rest*">{() => <SafePage><PartnerPortal /></SafePage>}</Route>}
      {(isPartner || isAdmin) && <Route path="/partner">{() => <SafePage><PartnerPortal /></SafePage>}</Route>}

      {/* Superadmin/Staff-only routes */}
      {isStaff && <Route path="/restaurants/:id">{() => <SafePage><RestaurantDetail /></SafePage>}</Route>}
      {isStaff && <Route path="/restaurants">{() => <SafePage><Restaurants /></SafePage>}</Route>}
      {isSuperadmin && <Route path="/users">{() => <SafePage><Users /></SafePage>}</Route>}
      {isSuperadmin && <Route path="/advertisements">{() => <SafePage><Advertisements /></SafePage>}</Route>}
      {isSuperadmin && <Route path="/reviews">{() => <SafePage><Reviews /></SafePage>}</Route>}
      {isSuperadmin && <Route path="/contracts/new">{() => <SafePage><ContractWizard /></SafePage>}</Route>}
      {isSuperadmin && <Route path="/contracts">{() => <SafePage><Contracts /></SafePage>}</Route>}
      {isSuperadmin && <Route path="/invoices">{() => <SafePage><Invoices /></SafePage>}</Route>}
      {isSuperadmin && <Route path="/subscriptions">{() => <SafePage><Subscriptions /></SafePage>}</Route>}
      {isSuperadmin && <Route path="/media">{() => <SafePage><MediaLibrary /></SafePage>}</Route>}
      {isSuperadmin && <Route path="/hardware">{() => <SafePage><Hardware /></SafePage>}</Route>}

      {/* Superadmin extra routes */}
      {isSuperadmin && <Route path="/roles-permissions">{() => <SafePage><RolesPermissions /></SafePage>}</Route>}
      {isSuperadmin && <Route path="/audit-logs">{() => <SafePage><AuditLogs /></SafePage>}</Route>}
      {isSuperadmin && <Route path="/activity-logs">{() => <SafePage><ActivityLogs /></SafePage>}</Route>}
      {isSuperadmin && <Route path="/system-monitor">{() => <SafePage><SystemMonitor /></SafePage>}</Route>}
      {isSuperadmin && <Route path="/system-settings">{() => <SafePage><SystemSettings /></SafePage>}</Route>}
      {isSuperadmin && <Route path="/local-connect">{() => <SafePage><LocalConnectPage /></SafePage>}</Route>}
      {isSuperadmin && <Route path="/backups">{() => <SafePage><BackupsPage /></SafePage>}</Route>}
      {isSuperadmin && <Route path="/qrorpa-statistiken">{() => <SafePage><QrorpaStatistiken /></SafePage>}</Route>}
      {isSuperadmin && <Route path="/country-config">{() => <SafePage><CountryConfigPage /></SafePage>}</Route>}

      {/* Partner extra routes */}
      {(isPartner || isAdmin) && <Route path="/partner/customers">{() => <SafePage><PartnerCustomers /></SafePage>}</Route>}
      {(isPartner || isAdmin) && <Route path="/partner/commissions">{() => <SafePage><PartnerCommissions /></SafePage>}</Route>}
      {(isPartner || isAdmin) && <Route path="/partner/leads">{() => <SafePage><PartnerLeads /></SafePage>}</Route>}
      {(isPartner || isAdmin) && <Route path="/partner/statistics">{() => <SafePage><PartnerStatistics /></SafePage>}</Route>}

      <Route>{() => <SafePage><NotFound /></SafePage>}</Route>
    </Switch>
  );
}

// Zeigt immer das KellnerDashboard – PIN-Kellner werden beim Login direkt zum Tischplan geleitet,
// können aber jederzeit manuell zum Dashboard navigieren.
function KellnerDashboardOrTables() {
  return <KellnerDashboard />;
}

// ── KELLNER-ROUTEN (ohne Admin-Sidebar, innerhalb KellnerLayout) ──────────────
function KellnerRoutes() {
  const { user } = useAuth();
  const isAdmin = user?.role === "superadmin" || user?.role === "admin";
  const isManager = user?.role === "manager" || isAdmin;
  const isKellner = user?.role === "kellner" || isManager;

  if (!isKellner) return <Redirect to="/login" />;

  return (
    <Switch>
      <Route path="/kellner/cart">{() => <SafePage><WaiterCart /></SafePage>}</Route>
      <Route path="/kellner/checkout">{() => <SafePage><WaiterCheckout /></SafePage>}</Route>
      <Route path="/kellner/history">{() => <SafePage><WaiterHistory /></SafePage>}</Route>
      <Route path="/kellner/orders">{() => <SafePage><WaiterOrders /></SafePage>}</Route>
      <Route path="/kellner/ready">{() => <SafePage><WaiterReady /></SafePage>}</Route>
      <Route path="/kellner/revenue">{() => <SafePage><WaiterRevenue /></SafePage>}</Route>
      <Route path="/kellner/shift">{() => <SafePage><WaiterShift /></SafePage>}</Route>
      <Route path="/kellner/absences">{() => <SafePage><WaiterAbsences /></SafePage>}</Route>
      <Route path="/kellner/planned-shifts">{() => <SafePage><WaiterPlannedShifts /></SafePage>}</Route>
      <Route path="/kellner/shift-swap">{() => <SafePage><WaiterShiftSwap /></SafePage>}</Route>
      <Route path="/kellner/calendar">{() => <SafePage><WaiterCalendar /></SafePage>}</Route>
      <Route path="/kellner/invoices">{() => <SafePage><WaiterInvoices /></SafePage>}</Route>
      <Route path="/kellner/split">{() => <SafePage><WaiterSplit /></SafePage>}</Route>
      <Route path="/kellner/tables">{() => <SafePage><WaiterTables /></SafePage>}</Route>
      <Route path="/kellner/order">{() => <SafePage><OrderView /></SafePage>}</Route>
      <Route path="/kellner/kiosk-stats">{() => <SafePage><KioskStats /></SafePage>}</Route>
      <Route path="/kellner/kiosk-monitor">{() => <SafePage><KioskMonitor /></SafePage>}</Route>
      <Route path="/kellner/kiosk-age-verification">{() => <SafePage><AgeVerificationPanel /></SafePage>}</Route>
      <Route path="/kellner">{() => <SafePage><KellnerDashboardOrTables /></SafePage>}</Route>
      {/* /waiter/* aliases */}
      <Route path="/waiter/cart">{() => <SafePage><WaiterCart /></SafePage>}</Route>
      <Route path="/waiter/checkout">{() => <SafePage><WaiterCheckout /></SafePage>}</Route>
      <Route path="/waiter/history">{() => <SafePage><WaiterHistory /></SafePage>}</Route>
      <Route path="/waiter/orders">{() => <SafePage><WaiterOrders /></SafePage>}</Route>
      <Route path="/waiter/ready">{() => <SafePage><WaiterReady /></SafePage>}</Route>
      <Route path="/waiter/revenue">{() => <SafePage><WaiterRevenue /></SafePage>}</Route>
      <Route path="/waiter/shift">{() => <SafePage><WaiterShift /></SafePage>}</Route>
      <Route path="/waiter/split">{() => <SafePage><WaiterSplit /></SafePage>}</Route>
      <Route path="/waiter/tables">{() => <SafePage><WaiterTables /></SafePage>}</Route>
      <Route path="/waiter/invoices">{() => <SafePage><WaiterInvoices /></SafePage>}</Route>
      <Route path="/waiter/order">{() => <SafePage><OrderView /></SafePage>}</Route>
      <Route path="/waiter">{() => <SafePage><KellnerDashboard /></SafePage>}</Route>
      <Route>{() => <SafePage><KellnerDashboard /></SafePage>}</Route>
    </Switch>
  );
}

// Globaler Session-Konflikt-Sperrbildschirm – überlagert die gesamte App
function SessionConflictGate() {
  const { sessionConflict } = useAuth();
  if (!sessionConflict) return null;
  return <SessionConflictOverlay />;
}

export default function App() {
  return (
    <ErrorBoundary name="app-root">
      <Switch>
        {/* Public routes – no DashboardLayout */}
        <Route path="/landing">{() => <SafePage><LandingPage /></SafePage>}</Route>
        <Route path="/install">{() => <SafePage><InstallApp /></SafePage>}</Route>
        <Route path="/onboarding">{() => <SafePage><OnboardingWizard /></SafePage>}</Route>
        <Route path="/login">{() => <SafePage><Login /></SafePage>}</Route>
        <Route path="/register">{() => <SafePage><Register /></SafePage>}</Route>
        <Route path="/verify">{() => <SafePage><VerifyEmail /></SafePage>}</Route>
        <Route path="/forgot-password">{() => <SafePage><ForgotPassword /></SafePage>}</Route>
        <Route path="/activate">{() => <SafePage><ActivateAccount /></SafePage>}</Route>
        <Route path="/subscription/success">{() => <SafePage><SubscriptionSuccess /></SafePage>}</Route>
        {/* Public guest QR order page – no auth required */}
        <Route path="/guest/order/:token">{() => <SafePage><GuestOrderPage /></SafePage>}</Route>
        {/* Public gift card pages – no auth required */}
        <Route path="/gift/purchase-success">{() => <SafePage><GiftCardPurchaseSuccess /></SafePage>}</Route>
        <Route path="/gift/buy/:restaurantId">{() => <SafePage><GiftCardBuyPage /></SafePage>}</Route>
        <Route path="/gift/:code">{() => <SafePage><GiftCardBalance /></SafePage>}</Route>

        {/* Public loyalty card pages – no auth required */}
        <Route path="/loyalty/register/:restaurantId">{() => <SafePage><GuestLoyalty /></SafePage>}</Route>
        <Route path="/loyalty/:token">{() => <SafePage><GuestLoyalty /></SafePage>}</Route>

        {/* NFC-Login Deep-Link (iOS NFC-Tag öffnet diese URL) */}
        <Route path="/nfc-login">{() => <SafePage><NfcLogin /></SafePage>}</Route>

        {/* Kiosk-Gast-Seite – public, kein Login */}
        <Route path="/kiosk/:token/success">{() => <SafePage><KioskGuestPage /></SafePage>}</Route>
        <Route path="/kiosk/:token">{() => <SafePage><KioskGuestPage /></SafePage>}</Route>

        {/* Lagerort QR-Scan-Seite – public, kein Login */}
        <Route path="/lager/:qrSlug">{() => <SafePage><WarehouseQrScan /></SafePage>}</Route>

        {/* Kellner-Routen – eigenes Layout OHNE Admin-Sidebar/Hamburger */}
        <Route path="/kellner/:rest*">
          <WaiterPinProvider>
            <KellnerLayout>
              <KellnerRoutes />
            </KellnerLayout>
          </WaiterPinProvider>
        </Route>
        <Route path="/waiter/:rest*">
          <WaiterPinProvider>
            <KellnerLayout>
              <KellnerRoutes />
            </KellnerLayout>
          </WaiterPinProvider>
        </Route>
        <Route path="/kellner">
          <WaiterPinProvider>
            <KellnerLayout>
              <KellnerRoutes />
            </KellnerLayout>
          </WaiterPinProvider>
        </Route>
        <Route path="/waiter">
          <WaiterPinProvider>
            <KellnerLayout>
              <KellnerRoutes />
            </KellnerLayout>
          </WaiterPinProvider>
        </Route>

        {/* Alle anderen geschützten Routen im Admin-DashboardLayout */}
        <Route>
          <WaiterPinProvider>
            <DashboardLayout>
              <ProtectedRoutes />
            </DashboardLayout>
          </WaiterPinProvider>
        </Route>
      </Switch>
      <Toaster richColors position="top-right" />
      <OfflineIndicator />
      <PwaInstallPrompt />
      <SessionConflictGate />
    </ErrorBoundary>
  );
}
