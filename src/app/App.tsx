import { HashRouter, Route, Routes } from 'react-router-dom';
import { PageTransition } from '@/components/ui/PageTransition';
import { ReminderSync } from './ReminderSync';
import { CaptureSetupPage } from '@/pages/CaptureSetupPage';
import { CardRulesPage } from '@/pages/CardRulesPage';
import { CardsPage } from '@/pages/CardsPage';
import { CategoriesPage } from '@/pages/CategoriesPage';
import { ExpenseFormPage } from '@/pages/ExpenseFormPage';
import { ExportPage } from '@/pages/ExportPage';
import { HistoryPage } from '@/pages/HistoryPage';
import { HomePage } from '@/pages/HomePage';
import { PayCardPage } from '@/pages/PayCardPage';
import { PaymentMethodsPage } from '@/pages/PaymentMethodsPage';
import { PendingPage } from '@/pages/PendingPage';
import { StatementsPage } from '@/pages/StatementsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { StatsPage } from '@/pages/StatsPage';
import { AppShell } from './AppShell';
import { BackButtonHandler } from './BackButtonHandler';
import { CaptureSync } from './CaptureSync';
import { DatabaseGate } from './DatabaseGate';
import { LockGate } from './LockGate';
import { ConfirmProvider } from './providers/ConfirmProvider';
import { PrivacyProvider } from './providers/PrivacyProvider';
import { ThemeProvider } from './providers/ThemeProvider';
import { ToastProvider } from './providers/ToastProvider';

export function App() {
  return (
    <DatabaseGate>
      {/* Recoge los gastos que detectó el teléfono; no tiene pantalla y no depende del bloqueo. */}
      <CaptureSync />
      <ThemeProvider>
        {/* LockGate: mientras la app esté bloqueada, no se monta nada de lo que hay debajo. */}
        <LockGate>
          <PrivacyProvider>
          <ToastProvider>
            <ConfirmProvider>
              {/* HashRouter: funciona igual en el navegador y dentro del WebView de Android. */}
              <HashRouter>
                <BackButtonHandler />
                <ReminderSync />
                <Routes>
                  <Route element={<AppShell />}>
                    <Route index element={<HomePage />} />
                    <Route path="gastos" element={<HistoryPage />} />
                    <Route path="estadisticas" element={<StatsPage />} />
                    <Route path="ajustes" element={<SettingsPage />} />
                  </Route>
                  <Route path="gasto/nuevo" element={<PageTransition><ExpenseFormPage /></PageTransition>} />
                  <Route path="gasto/:id" element={<PageTransition><ExpenseFormPage /></PageTransition>} />
                  <Route path="pendientes" element={<PageTransition><PendingPage /></PageTransition>} />
                  <Route path="tarjetas" element={<PageTransition><CardsPage /></PageTransition>} />
                  <Route path="tarjetas/:id/pagar" element={<PageTransition><PayCardPage /></PageTransition>} />
                  <Route path="tarjetas/:id/extractos" element={<PageTransition><StatementsPage /></PageTransition>} />
                  <Route path="tarjetas/:id/fechas" element={<PageTransition><CardRulesPage /></PageTransition>} />
                  <Route path="ajustes/categorias" element={<PageTransition><CategoriesPage /></PageTransition>} />
                  <Route path="ajustes/metodos" element={<PageTransition><PaymentMethodsPage /></PageTransition>} />
                  <Route path="ajustes/exportar" element={<PageTransition><ExportPage /></PageTransition>} />
                  <Route path="ajustes/captura" element={<PageTransition><CaptureSetupPage /></PageTransition>} />
                  <Route path="*" element={<HomePage />} />
                </Routes>
              </HashRouter>
            </ConfirmProvider>
          </ToastProvider>
          </PrivacyProvider>
        </LockGate>
      </ThemeProvider>
    </DatabaseGate>
  );
}
