import { useEffect, useState } from "react";
import "../App.css";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// =========================
// BOARD SETTINGS
// =========================

const COLS = 11;
const ROWS = 12;

const HEX_SIZE = 35;
const UNIT_IMAGE_SIZE = 27;
const GAME_MASTER_VALUE = "__game-master__";
const PROFILE_SESSION_KEY = "rrpg-profile-session";
const MAP_MARGIN = 10;

const MAP_WIDTH =
    50 +
    (COLS - 1) * HEX_SIZE * Math.sqrt(3) +
    (ROWS % 2 ? HEX_SIZE * Math.sqrt(3) / 2 : 0) +
    HEX_SIZE * Math.sqrt(3) / 2 +
    MAP_MARGIN;

const MAP_HEIGHT =
    50 +
    (ROWS - 1) * HEX_SIZE * 1.5 +
    HEX_SIZE +
    MAP_MARGIN;

function getStoredProfile() {
    try {
        const storedProfile = sessionStorage.getItem(
            PROFILE_SESSION_KEY
        );

        return storedProfile
            ? JSON.parse(storedProfile)
            : null;
    } catch {
        return null;
    }
}

// =========================
// LOAD PLAYER IMAGES
// =========================

const playerImages = import.meta.glob(
    "../assets/players/*.{png,jpg,jpeg,webp,svg}",
    {
        eager: true,
        import: "default"
    }
);


// =========================
// LOAD ENEMY IMAGES
// =========================

const enemyImages = import.meta.glob(
    "../assets/enemies/*.{png,jpg,jpeg,webp,svg}",
    {
        eager: true,
        import: "default"
    }
);


// =========================
// CREATE PLAYER UNITS
// =========================

const initialUnits = Object.entries(playerImages).map(
    ([path, image], index) => {

        const filename = path
            .split("/")
            .pop();

        const name = filename.replace(
            /\.[^/.]+$/,
            ""
        );

        const col = index % COLS;
        const row = Math.floor(index / COLS);

        return {
            id: `player-${index}`,
            name,
            image,
            col,
            row,
            type: "player",
            abilities: []
        };
    }
);


// =========================
// CREATE ENEMY UNITS
// =========================

const initialEnemies = Object.entries(enemyImages).map(
    ([path, image], index) => {

        const filename = path
            .split("/")
            .pop();

        const name = filename.replace(
            /\.[^/.]+$/,
            ""
        );

        const col = 5 + (index % 5);
        const row = 5 + Math.floor(index / 5);

        return {
            id: `enemy-${index}`,
            name,
            image,
            col,
            row,
            type: "enemy"
        };
    }
);

function getUnitsForJoin(currentUnits) {
    return currentUnits.map(unit => {
        const initialUnit = initialUnits.find(
            candidate => candidate.id === unit.id
        );

        return {
            ...unit,
            abilities: Array.isArray(unit.abilities) &&
                unit.abilities.length > 0
                ? unit.abilities
                : initialUnit?.abilities || []
        };
    });
}

function getAbilityStatus(ability) {
    return ability.status || "whole";
}

function getNextAbilityStatus(status) {
    if (status === "whole") {
        return "broken";
    }

    if (status === "broken") {
        return "reforged";
    }

    return "whole";
}


// =========================
// HEX GEOMETRY
// =========================

function hexPoints(x, y) {

    const points = [];

    for (let i = 0; i < 6; i++) {

        const angle =
            (Math.PI / 180) *
            (60 * i - 30);

        points.push(
            `${x + HEX_SIZE * Math.cos(angle)},${
                y + HEX_SIZE * Math.sin(angle)
            }`
        );
    }

    return points.join(" ");
}


// Smaller hex used to crop player images
function unitHexPoints(x, y) {

    const points = [];

    for (let i = 0; i < 6; i++) {

        const angle =
            (Math.PI / 180) *
            (60 * i - 30);

        points.push(
            `${x + UNIT_IMAGE_SIZE * Math.cos(angle)},${
                y + UNIT_IMAGE_SIZE * Math.sin(angle)
            }`
        );
    }

    return points.join(" ");
}

function offsetToCube(col, row) {
    const q =
        col - (row - (row & 1)) / 2;

    return {
        q,
        r: row,
        s: -q - row
    };
}

function cubeToOffset(cube) {
    return {
        col: cube.q + (cube.r - (cube.r & 1)) / 2,
        row: cube.r
    };
}

function roundCube(cube) {
    let q = Math.round(cube.q);
    let r = Math.round(cube.r);
    let s = Math.round(cube.s);

    const qDifference = Math.abs(q - cube.q);
    const rDifference = Math.abs(r - cube.r);
    const sDifference = Math.abs(s - cube.s);

    if (qDifference > rDifference && qDifference > sDifference) {
        q = -r - s;
    } else if (rDifference > sDifference) {
        r = -q - s;
    } else {
        s = -q - r;
    }

    return { q, r, s };
}

function getHexLine(firstCol, firstRow, secondCol, secondRow) {
    const firstCube = offsetToCube(firstCol, firstRow);
    const secondCube = offsetToCube(secondCol, secondRow);
    const distance = Math.max(
        Math.abs(firstCube.q - secondCube.q),
        Math.abs(firstCube.r - secondCube.r),
        Math.abs(firstCube.s - secondCube.s)
    );

    return Array.from({ length: Math.max(distance - 1, 0) })
        .map((_, index) => {
            const progress = (index + 1) / distance;
            const cube = roundCube({
                q: firstCube.q + (secondCube.q - firstCube.q) * progress,
                r: firstCube.r + (secondCube.r - firstCube.r) * progress,
                s: firstCube.s + (secondCube.s - firstCube.s) * progress
            });

            return cubeToOffset(cube);
        });
}


// =========================
// GAME
// =========================

function Game() {

    const [storedProfile] = useState(getStoredProfile);

    const [socket, setSocket] =
        useState(null);

    const [connectionStatus, setConnectionStatus] =
        useState("connecting");

    const [players, setPlayers] =
        useState([]);

    const [multiplayerError, setMultiplayerError] =
        useState("");

    // =========================
    // PLAYER PROFILE
    // =========================

    const [playerProfile, setPlayerProfile] =
        useState(storedProfile);

    const [profileName, setProfileName] =
        useState(storedProfile?.name || "");

    const [profileImage, setProfileImage] =
        useState(
            storedProfile?.role === "game-master"
                ? GAME_MASTER_VALUE
                : storedProfile?.image || ""
        );


    // =========================
    // UNITS
    // =========================

    const [units, setUnits] =
        useState([
            ...initialUnits,
            ...initialEnemies
        ]);

    const [selectedUnit, setSelectedUnit] =
        useState(storedProfile?.unitId || null);

    const [expandedAbilities, setExpandedAbilities] =
        useState({});

    const [hoveredHex, setHoveredHex] =
        useState(null);

    useEffect(() => {
        const websocketUrl =
            import.meta.env.VITE_WS_URL ||
            `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`;

        const socket = new WebSocket(websocketUrl);

        socket.addEventListener("open", () => {
            setSocket(socket);
            setConnectionStatus("connected");
        });

        socket.addEventListener("message", event => {
            let message;

            try {
                message = JSON.parse(event.data);
            } catch {
                return;
            }

            if (message.type !== "state") {
                if (message.type === "error") {
                    setMultiplayerError(message.message || "Multiplayer error");
                    setProfileImage("");
                    setPlayerProfile(null);
                    sessionStorage.removeItem(PROFILE_SESSION_KEY);
                }
                return;
            }

            setMultiplayerError("");

            if (Array.isArray(message.units)) {
                setUnits(message.units);
            }

            setPlayers(
                Array.isArray(message.players)
                    ? message.players
                    : []
            );
        });

        socket.addEventListener("close", () => {
            setConnectionStatus("offline");
        });

        socket.addEventListener("error", () => {
            setConnectionStatus("offline");
        });

        return () => {
            socket.close();
            setSocket(null);
        };
    }, []);

    useEffect(() => {
        if (!socket || !playerProfile) {
            return;
        }

        socket.send(
            JSON.stringify({
                type: "join",
                profile: playerProfile,
                units: getUnitsForJoin([
                    ...initialUnits,
                    ...initialEnemies
                ])
            })
        );

    }, [socket, playerProfile]);


    // =========================
    // HEX POSITION
    // =========================

    function getHexPosition(col, row) {

        const x =
            50 +
            col *
                HEX_SIZE *
                Math.sqrt(3) +
            (row % 2) *
                (HEX_SIZE *
                    Math.sqrt(3) /
                    2);

        const y =
            50 +
            row *
                HEX_SIZE *
                1.5;

        return {
            x,
            y
        };
    }

    function getHexDistance(firstCol, firstRow, secondCol, secondRow) {
        const firstQ =
            firstCol - (firstRow - (firstRow & 1)) / 2;
        const secondQ =
            secondCol - (secondRow - (secondRow & 1)) / 2;

        const firstCube = {
            q: firstQ,
            r: firstRow,
            s: -firstQ - firstRow
        };
        const secondCube = {
            q: secondQ,
            r: secondRow,
            s: -secondQ - secondRow
        };

        return Math.max(
            Math.abs(firstCube.q - secondCube.q),
            Math.abs(firstCube.r - secondCube.r),
            Math.abs(firstCube.s - secondCube.s)
        );
    }

    function updateAbilityStatus(ability) {
        if (
            playerProfile?.role !== "player" ||
            !playerProfile.unitId ||
            socket?.readyState !== WebSocket.OPEN
        ) {
            return;
        }

        socket.send(
            JSON.stringify({
                type: "update-ability-status",
                targetUnitId: playerProfile.unitId,
                abilityName: ability.name,
                status: getNextAbilityStatus(getAbilityStatus(ability))
            })
        );
    }


    // =========================
    // RESET BOARD
    // =========================

    function resetBoard() {
        if (
            playerProfile?.role !== "game-master" ||
            socket?.readyState !== WebSocket.OPEN
        ) {
            return;
        }

        if (window.confirm("Are you sure you want to reset the board? This will clear all unit positions and abilities.")) {
            socket.send(
                JSON.stringify({
                    type: "reset-board",
                    units: [
                        ...initialUnits.map(unit => ({
                            ...unit,
                            abilities: []
                        })),
                        ...initialEnemies
                    ]
                })
            );
        }
    }


    // =========================
    // CREATE PROFILE
    // =========================

    function createProfile() {

        if (!profileName.trim()) {
            return;
        }

        if (!profileImage) {
            return;
        }

        if (profileImage === GAME_MASTER_VALUE) {
            const profile = {
                name: profileName.trim(),
                image: "",
                imageName: "Game Master",
                role: "game-master"
            };

            setPlayerProfile(profile);
            setSelectedUnit(null);
            sessionStorage.setItem(
                PROFILE_SESSION_KEY,
                JSON.stringify(profile)
            );
            return;
        }

        const selectedImage =
            Object.entries(playerImages).find(
                ([, image]) =>
                    image === profileImage
            );

        if (!selectedImage) {
            return;
        }

        const filename =
            selectedImage[0]
                .split("/")
                .pop();

        const imageName =
            filename.replace(
                /\.[^/.]+$/,
                ""
            );

        const ownedUnit = units.find(
            unit =>
                unit.type === "player" &&
                unit.image === profileImage
        );

        if (!ownedUnit) {
            return;
        }

        const profile = {
            name: profileName.trim(),
            image: profileImage,
            imageName,
            role: "player",
            unitId: ownedUnit.id
        };

        setPlayerProfile(profile);
        sessionStorage.setItem(
            PROFILE_SESSION_KEY,
            JSON.stringify(profile)
        );


        // Find the unit corresponding
        // to the selected player image

        setSelectedUnit(ownedUnit.id);
    }

    function logout() {
        sessionStorage.removeItem(PROFILE_SESSION_KEY);
        setPlayerProfile(null);
        setProfileName("");
        setProfileImage("");
        setSelectedUnit(null);
    }

    const claimedUnitIds = new Set(
        players.map(player => player.unitId)
    );

    const availablePlayerImages = Object.entries(
        playerImages
    ).filter(([, image], index) =>
        !claimedUnitIds.has(`player-${index}`) ||
        image === playerProfile?.image
    );

    const gameMasterClaimed = players.some(
        player => player.role === "game-master"
    );

    const sortedPlayers = [...players].sort(
        (firstPlayer, secondPlayer) => {
            const firstIsGameMaster =
                firstPlayer.role === "game-master";
            const secondIsGameMaster =
                secondPlayer.role === "game-master";

            if (firstIsGameMaster !== secondIsGameMaster) {
                return firstIsGameMaster ? -1 : 1;
            }

            return firstPlayer.name.localeCompare(
                secondPlayer.name,
                undefined,
                { sensitivity: "base" }
            );
        }
    );

    const selectedToken = units.find(
        unit => unit.id === selectedUnit
    );

    const displayedAbilities =
        playerProfile?.role !== "game-master" &&
        selectedToken?.type === "player"
            ? selectedToken.abilities || []
            : [];


    // =========================
    // HANDLE HEX CLICK
    // =========================

    function handleHexClick(col, row) {

        const clickedUnit =
            units.find(
                unit =>
                    unit.col === col &&
                    unit.row === row
            );


        // If a unit was clicked,
        // select it only if it belongs
        // to this player

        if (clickedUnit) {

            if (playerProfile?.role === "game-master") {
                setSelectedUnit(clickedUnit.id);
            } else if (
                playerProfile &&
                clickedUnit.type === "player" &&
                clickedUnit.image === playerProfile.image
            ) {

                setSelectedUnit(
                    clickedUnit.id
                );
            }

            return;
        }


        // No unit was clicked.
        // Only allow movement if the
        // selected unit belongs to us.

        if (
            selectedUnit === null ||
            !playerProfile
        ) {
            return;
        }


        const selected =
            units.find(
                unit =>
                    unit.id ===
                    selectedUnit
            );


        // Make absolutely sure this is
        // the player's own unit

        if (!selected) {
            return;
        }

        if (
            playerProfile.role !== "game-master" &&
            (selected.type !== "player" ||
                selected.image !== playerProfile.image)
        ) {
            return;
        }


        // Move the player's unit

        if (socket?.readyState !== WebSocket.OPEN) {
            return;
        }

        socket.send(
            JSON.stringify({
                type: "move",
                unitId: selectedUnit,
                col,
                row
            })
        );
    }


    // =========================
    // RENDER
    // =========================

    return (
        <div className="game">

            <h1>
                Reforged RPG
            </h1>

            {/* ========================= */}
            {/* PROFILE MODAL              */}
            {/* ========================= */}

            {!playerProfile && (

                <div className="profile-overlay">

                    <div className="profile-modal">

                        <h2>
                            Create Your Profile
                        </h2>

                        {multiplayerError && (
                            <p className="multiplayer-error">
                                {multiplayerError}
                            </p>
                        )}


                        <label>
                            Name
                        </label>

                        <input
                            type="text"
                            value={profileName}
                            onChange={event =>
                                setProfileName(
                                    event.target.value
                                )
                            }
                            placeholder="Enter your name"
                        />


                        <label>
                            Player
                        </label>

                        <select
                            value={profileImage}
                            onChange={event =>
                                setProfileImage(
                                    event.target.value
                                )
                            }
                        >

                            <option value="">
                                Choose your character
                            </option>

                            {!gameMasterClaimed && (
                                <option value={GAME_MASTER_VALUE}>
                                    Game Master
                                </option>
                            )}

                            {availablePlayerImages.map(
                                ([path, image]) => {

                                    const filename =
                                        path
                                            .split("/")
                                            .pop();

                                    const name =
                                        filename.replace(
                                            /\.[^/.]+$/,
                                            ""
                                        );

                                    return (
                                        <option
                                            key={path}
                                            value={image}
                                        >
                                            {name}
                                        </option>
                                    );
                                }
                            )}

                        </select>


                        {/* Preview */}

                        {profileImage &&
                            profileImage !== GAME_MASTER_VALUE && (

                            <img
                                src={profileImage}
                                alt="Character preview"
                                className="profile-preview"
                            />

                        )}


                        <button
                            onClick={
                                createProfile
                            }
                            disabled={
                                !profileName.trim() ||
                                !profileImage
                            }
                        >
                            Enter Game
                        </button>

                    </div>

                </div>

            )}


            {/* ========================= */}
            {/* GAME BOARD                 */}
            {/* ========================= */}

            <div className="game-layout">

                <aside className="multiplayer-panel">
                    <div className="multiplayer-status">
                        <span className={`connection-dot ${connectionStatus}`} />
                        {connectionStatus === "connected"
                            ? `${players.length} player${players.length === 1 ? "" : "s"} online`
                            : "Multiplayer offline"}
                    </div>

                    {playerProfile?.role === "game-master" && (
                        <button
                            onClick={resetBoard}
                            className="board-action-button"
                            title="Reset the board to initial state"
                        >
                            Reset Board
                        </button>
                    )}

                    <button
                        type="button"
                        className="board-action-button"
                        onClick={logout}
                    >
                        Logout
                    </button>

                    {sortedPlayers.length === 0 ? (
                        <p className="empty-player-list">
                            No players online
                        </p>
                    ) : (
                        <ul className="player-list">
                            {sortedPlayers.map(player => (
                                <li key={player.id} className="player-list-item">
                                    <strong>{player.name}</strong>
                                    <span>{player.imageName}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </aside>

                <svg
                    width="800"
                    height="700"
                    viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
                >

                {/* ========================= */}
                {/* IMAGE CLIPPING DEFINITIONS */}
                {/* ========================= */}

                <defs>

                    {units.map(unit => {

                        const {
                            x,
                            y
                        } =
                            getHexPosition(
                                unit.col,
                                unit.row
                            );

                        return (
                            <clipPath
                                key={`clip-${unit.id}`}
                                id={`unit-clip-${unit.id}`}
                            >

                                <polygon
                                    points={unitHexPoints(
                                        x,
                                        y
                                    )}
                                />

                            </clipPath>
                        );
                    })}

                </defs>


                {/* ========================= */}
                {/* HEX GRID                   */}
                {/* ========================= */}

                {Array.from({
                    length: COLS
                }).map((_, col) =>

                    Array.from({
                        length: ROWS
                    }).map((_, row) => {

                        const {
                            x,
                            y
                        } =
                            getHexPosition(
                                col,
                                row
                            );


                        const occupyingUnit =
                            units.find(
                                unit =>
                                    unit.col ===
                                        col &&
                                    unit.row ===
                                        row
                            );


                        const isEnemy =
                            occupyingUnit?.type ===
                            "enemy";


                        return (
                            <polygon
                                key={`${col}-${row}`}
                                points={hexPoints(
                                    x,
                                    y
                                )}
                                className={
                                    isEnemy
                                        ? "hex enemy-hex"
                                        : "hex"
                                }
                                onClick={() =>
                                    handleHexClick(
                                        col,
                                        row
                                    )
                                }
                                onMouseEnter={() =>
                                    setHoveredHex({ col, row })
                                }
                                onMouseLeave={() =>
                                    setHoveredHex(null)
                                }
                                style={{
                                    cursor:
                                        "pointer"
                                }}
                            />
                        );
                    })
                )}

                {hoveredHex && selectedUnit !== null && (() => {
                    const selected = units.find(
                        unit => unit.id === selectedUnit
                    );

                    if (!selected) {
                        return null;
                    }

                    return getHexLine(
                        selected.col,
                        selected.row,
                        hoveredHex.col,
                        hoveredHex.row
                    ).map(hex => {
                        const {
                            x,
                            y
                        } = getHexPosition(
                            hex.col,
                            hex.row
                        );

                        return (
                            <polygon
                                key={`path-${hex.col}-${hex.row}`}
                                points={hexPoints(x, y)}
                                className="hex-path"
                                pointerEvents="none"
                            />
                        );
                    });
                })()}

                {hoveredHex && selectedUnit !== null && (() => {
                    const selected = units.find(
                        unit => unit.id === selectedUnit
                    );

                    if (!selected) {
                        return null;
                    }

                    const {
                        x,
                        y
                    } = getHexPosition(
                        hoveredHex.col,
                        hoveredHex.row
                    );
                    const distance = getHexDistance(
                        selected.col,
                        selected.row,
                        hoveredHex.col,
                        hoveredHex.row
                    );

                    return (
                        <text
                            x={x}
                            y={y + 6}
                            textAnchor="middle"
                            className="hex-distance"
                            pointerEvents="none"
                        >
                            {distance}
                        </text>
                    );
                })()}


                {/* ========================= */}
                {/* SELECTED HEX               */}
                {/* ========================= */}

                {units.map(unit => {

                    if (
                        unit.id !==
                        selectedUnit
                    ) {
                        return null;
                    }


                    const {
                        x,
                        y
                    } =
                        getHexPosition(
                            unit.col,
                            unit.row
                        );


                    return (
                        <polygon
                            key={`selected-${unit.id}`}
                            points={hexPoints(
                                x,
                                y
                            )}
                            className="hex selected"
                            pointerEvents="none"
                        />
                    );
                })}


                {/* ========================= */}
                {/* PLAYER / ENEMY UNITS      */}
                {/* ========================= */}

                {units.map(unit => {

                    const {
                        x,
                        y
                    } =
                        getHexPosition(
                            unit.col,
                            unit.row
                        );


                    return (
                        <g
                            key={unit.id}
                            onClick={event => {

                                event.stopPropagation();

                                handleHexClick(
                                    unit.col,
                                    unit.row
                                );
                            }}
                            style={{
                                cursor:
                                    "pointer"
                            }}
                        >

                            {/* ================= */}
                            {/* PLAYER IMAGE       */}
                            {/* ================= */}

                            <image
                                href={unit.image}

                                x={
                                    x -
                                    UNIT_IMAGE_SIZE
                                }

                                y={
                                    y -
                                    UNIT_IMAGE_SIZE
                                }

                                width={
                                    UNIT_IMAGE_SIZE *
                                    2
                                }

                                height={
                                    UNIT_IMAGE_SIZE *
                                    2
                                }

                                preserveAspectRatio="xMidYMid slice"

                                clipPath={`url(#unit-clip-${unit.id})`}
                            />


                            {/* ================= */}
                            {/* PLAYER NAME        */}
                            {/* ================= */}

                            <text
                                x={x}
                                y={
                                    y -
                                    HEX_SIZE +
                                    60
                                }
                                textAnchor="middle"
                                className="unit-name"
                            >
                                {unit.name}
                            </text>

                        </g>
                    );
                })}

                </svg>

                <aside className="ability-panel">
                    <h2>Abilities</h2>

                    {displayedAbilities.length === 0 ? (
                        <p className="empty-ability-list">
                            No abilities available
                        </p>
                    ) : (
                        displayedAbilities.map(ability => (
                            (() => {
                                const abilityLines =
                                    ability.markdown.split(/\r?\n/);
                                const abilityDetails =
                                    abilityLines.slice(1).join("\n").trim();
                                const isExpanded =
                                    expandedAbilities[ability.name] === true;

                                return (
                                    <section
                                        key={ability.name}
                                        className={`ability-entry ability-${getAbilityStatus(ability)}`}
                                    >
                                        <div className="ability-heading-row">
                                            <h2>{ability.name}</h2>

                                            <button
                                                type="button"
                                                className="ability-state-toggle"
                                                title={
                                                    getAbilityStatus(ability) === "whole"
                                                        ? "Break"
                                                        : getAbilityStatus(ability) === "broken"
                                                            ? "Reforge"
                                                            : "Whole"
                                                }
                                                aria-label={
                                                    getAbilityStatus(ability) === "whole"
                                                        ? `Break ${ability.name}`
                                                        : getAbilityStatus(ability) === "broken"
                                                            ? `Reforge ${ability.name}`
                                                            : `Make ${ability.name} whole`
                                                }
                                                onClick={() =>
                                                    updateAbilityStatus(ability)
                                                }
                                            >
                                                {getAbilityStatus(ability) === "whole"
                                                    ? "X"
                                                    : getAbilityStatus(ability) === "broken"
                                                        ? "O"
                                                        : "-"}
                                            </button>

                                            <button
                                                type="button"
                                                className="ability-toggle"
                                                aria-label={`${isExpanded ? "Collapse" : "Expand"} ${ability.name}`}
                                                aria-expanded={isExpanded}
                                                onClick={() =>
                                                    setExpandedAbilities(
                                                        current => ({
                                                            ...current,
                                                            [ability.name]: !isExpanded
                                                        })
                                                    )
                                                }
                                            >
                                                {isExpanded ? "v" : ">"}
                                            </button>
                                        </div>

                                        {isExpanded && (
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm]}
                                            >
                                                {abilityDetails}
                                            </ReactMarkdown>
                                        )}
                                    </section>
                                );
                            })()
                        ))
                    )}
                </aside>
            </div>

        </div>
    );
}

export default Game;