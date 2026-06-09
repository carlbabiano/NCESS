import './App.css';

import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import PrivateRoute from './components/PrivateRoute';

import LandingPage from './pages/landingpage/landingpage';

import UserLogin from './pages/userside/userlogin';
import UserSignup from './pages/userside/usersignup';
import UserDashboard from './pages/userside/userdashboard';
import UserAnnouncements from './pages/userside/userannouncements';
import UserAppointments from './pages/userside/userappointments';
import UserComplaints from './pages/userside/usercomplaints';
import UserBarangaySupport from './pages/userside/userbarangaysupport';
import UserSideHotlineMapping from './pages/userside/usersidehotlinemapping';

import AdminLogin from './pages/adminside/adminlogin';
import AdminDashboard from "./pages/adminside/admindashboard";
import AdminAnnouncements from './pages/adminside/adminannouncements';
import AdminAppointments from './pages/adminside/adminappointments';
import AdminComplaints from './pages/adminside/admincomplaints';
import AdminBarangaySupport from './pages/adminside/adminbarangaysupport';
import AdminResidents from './pages/adminside/adminresidents';
import AdminProfileRequest from './pages/adminside/adminprofilerequest';

import AdminRoles from './pages/adminside/adminroles';
import AdminScanQr from './pages/adminside/adminscanqr';

const CAPTAIN_SECRETARY_ROLES = ['barangaycaptain', 'secretary'];

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<LandingPage />} />

          <Route path="/userlogin" element={<UserLogin />} />
          <Route path="/usersignup" element={<UserSignup />} />

          <Route path="/userdashboard" element={<PrivateRoute><UserDashboard /></PrivateRoute>} />
          <Route path='/userannouncements' element={<PrivateRoute><UserAnnouncements /></PrivateRoute>} />
          <Route path='/userappointments' element={<PrivateRoute><UserAppointments /></PrivateRoute>} />
          <Route path='/usercomplaints' element={<PrivateRoute><UserComplaints /></PrivateRoute>} />
          <Route path='/userbarangaysupport' element={<PrivateRoute><UserBarangaySupport /></PrivateRoute>} />
          <Route path='/usersidehotlinemapping' element={<PrivateRoute><UserSideHotlineMapping /></PrivateRoute>} />

          <Route path="/adminlogin" element={<AdminLogin />} />
          
          <Route path="/admindashboard" element={<PrivateRoute><AdminDashboard /></PrivateRoute>} />
          <Route path="/adminannouncements" element={<PrivateRoute><AdminAnnouncements /></PrivateRoute>} />
          <Route path="/adminappointments" element={<PrivateRoute><AdminAppointments /></PrivateRoute>} />
          <Route path="/admincomplaints" element={<PrivateRoute allowedAdminRoles={CAPTAIN_SECRETARY_ROLES}><AdminComplaints /></PrivateRoute>} />
          <Route path="/adminbarangaysupport" element={<PrivateRoute allowedAdminRoles={CAPTAIN_SECRETARY_ROLES}><AdminBarangaySupport /></PrivateRoute>} />
          <Route path="/adminresidents" element={<PrivateRoute allowedAdminRoles={CAPTAIN_SECRETARY_ROLES}><AdminResidents /></PrivateRoute>} />
          <Route path="/adminresidents/account-approval" element={<PrivateRoute allowedAdminRoles={CAPTAIN_SECRETARY_ROLES}><AdminResidents initialTab="Pending" /></PrivateRoute>} />
          <Route path="/adminprofilerequest" element={<PrivateRoute allowedAdminRoles={CAPTAIN_SECRETARY_ROLES}><AdminProfileRequest /></PrivateRoute>} />
          <Route path="/adminroles" element={<PrivateRoute><AdminRoles /></PrivateRoute>} />
          <Route path="/adminscanqr" element={<PrivateRoute><AdminScanQr /></PrivateRoute>} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
