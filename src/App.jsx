import { NavLink, Routes, Route } from "react-router-dom";

import Game from "./pages/Game";
import Rules from "./pages/Rules";
import Abilities from "./pages/Abilities";

import "./App.css";

function App() {
    return (
        <div className="app">
            <nav className="main-nav">
                <NavLink to="/">
                    Game
                </NavLink>

                <NavLink to="/rules">
                    Rules
                </NavLink>

                <NavLink to="/abilities">
                    Abilities
                </NavLink>
            </nav>

            <main>
                <Routes>
                    <Route
                        path="/"
                        element={<Game />}
                    />

                    <Route
                        path="/game"
                        element={<Game />}
                    />

                    <Route
                        path="/rules"
                        element={<Rules />}
                    />

                    <Route
                        path="/abilities"
                        element={<Abilities />}
                    />
                </Routes>
            </main>
        </div>
    );
}

export default App;