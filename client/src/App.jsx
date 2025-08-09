import { Routes, Route, Link } from "react-router-dom";
import "./App.css";
import Home from "./Home.jsx";
import Admin from "./Admin.jsx";

export default function App() {
  return (
    <div>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/admin">Admin</Link>
      </nav>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </div>
  );
}
