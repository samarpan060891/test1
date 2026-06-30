import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import { LanguageProvider } from './context/LanguageContext.jsx'
import { CurrencyProvider } from './context/CurrencyContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import LoginPage from './pages/LoginPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import MapInspectionPage from './pages/MapInspectionPage.jsx'
import JobDetailPage from './pages/JobDetailPage.jsx'
import ChecklistFillPage from './pages/ChecklistFillPage.jsx'
import QAReviewPage from './pages/QAReviewPage.jsx'
import POLogPage from './pages/POLogPage.jsx'
import ChecklistTemplatesPage from './pages/ChecklistTemplatesPage.jsx'
import AdminUsersPage from './pages/AdminUsersPage.jsx'
import AdminMastersPage from './pages/AdminMastersPage.jsx'
import ChangePasswordPage from './pages/ChangePasswordPage.jsx'
import InspectionCostPage from './pages/InspectionCostPage.jsx'
import DocumentControlPage from './pages/DocumentControlPage.jsx'
import SupplierScorecardPage from './pages/SupplierScorecardPage.jsx'

export default function App() {
  return (
    <LanguageProvider>
    <CurrencyProvider>
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/map-inspection"
          element={
            <ProtectedRoute allowedRoles={['qa', 'buying']}>
              <MapInspectionPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/jobs/:id"
          element={
            <ProtectedRoute>
              <JobDetailPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/jobs/:id/fill"
          element={
            <ProtectedRoute allowedRoles={['agency_user', 'supplier_user']}>
              <ChecklistFillPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/jobs/:id/review"
          element={
            <ProtectedRoute allowedRoles={['qa']}>
              <QAReviewPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/po-log"
          element={
            <ProtectedRoute>
              <POLogPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/checklist-templates"
          element={
            <ProtectedRoute allowedRoles={['qa', 'admin']}>
              <ChecklistTemplatesPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/users"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminUsersPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/masters"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminMastersPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/scorecard"
          element={
            <ProtectedRoute allowedRoles={['admin','qa','buying','imports','accounts','supplier_user']}>
              <SupplierScorecardPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/change-password"
          element={
            <ProtectedRoute>
              <ChangePasswordPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/inspection-costs"
          element={
            <ProtectedRoute allowedRoles={['qa', 'buying', 'imports', 'accounts', 'agency_user', 'admin', 'supplier_user']}>
              <InspectionCostPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/documents"
          element={
            <ProtectedRoute>
              <DocumentControlPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
    </CurrencyProvider>
    </LanguageProvider>
  )
}
