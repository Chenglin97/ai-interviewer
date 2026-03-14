import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import RoleBuilder from './pages/RoleBuilder'
import RoleDashboard from './pages/RoleDashboard'
import Interview from './pages/Interview'
import Scorecard from './pages/Scorecard'
import Review from './pages/Review'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/roles/new" element={<RoleBuilder />} />
        <Route path="/roles/:roleId" element={<RoleDashboard />} />
        <Route path="/interview/:sessionId" element={<Interview />} />
        <Route path="/scorecard/:sessionId" element={<Scorecard />} />
        <Route path="/review/:sessionId" element={<Review />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
