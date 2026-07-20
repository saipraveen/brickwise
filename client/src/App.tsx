import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Scan from "./pages/Scan";
import Inventory from "./pages/Inventory";
import Sets from "./pages/Sets";
import Bags from "./pages/Bags";
import Mocs from "./pages/Mocs";
import Rebuilds from "./pages/Rebuilds";
import Display from "./pages/Display";
import Sharing from "./pages/Sharing";
import Search from "./pages/Search";
import Login from "./pages/Login";
import About from "./pages/About";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="scan" element={<Scan />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="sets" element={<Sets />} />
          <Route path="bags" element={<Bags />} />
          <Route path="mocs" element={<Mocs />} />
          <Route path="rebuilds" element={<Rebuilds />} />
          <Route path="display" element={<Display />} />
          <Route path="sharing" element={<Sharing />} />
          <Route path="search" element={<Search />} />
          <Route path="login" element={<Login />} />
          <Route path="about" element={<About />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
