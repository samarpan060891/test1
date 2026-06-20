import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import LoginPage from './pages/LoginPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import MapInspectionPage from './pages/MapInspectionPage.jsx'
import JobDetailPage from './pages/JobDetailPage.jsx'
import ChecklistFillPage from './pages/ChecklistFillPage.jsx'
import QAReviewPage from './pages/QAReviewPage.jsx'
import POLogPage from './pages/POLogPage.jsx'
import ChecklistTemplatesPage from './pages/ChecklistTemplatesPage.jsx'

export default function App() {
  return (
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
            <ProtectedRoute allowedRoles={['qa']}>
              <ChecklistTemplatesPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  )
}
