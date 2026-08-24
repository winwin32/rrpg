import { useState } from "react";
import "../App.css";

// =========================
// BOARD SETTINGS
// =========================

const COLS = 11;
const ROWS = 12;

const HEX_SIZE = 35;
const UNIT_IMAGE_SIZE = 27;


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
            type: "player"
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


// =========================
// GAME
// =========================

function Game() {

    // =========================
    // PLAYER PROFILE
    // =========================

    const [playerProfile, setPlayerProfile] =
        useState(null);

    const [profileName, setProfileName] =
        useState("");

    const [profileImage, setProfileImage] =
        useState("");


    // =========================
    // UNITS
    // =========================

    const [units, setUnits] =
        useState([
            ...initialUnits,
            ...initialEnemies
        ]);

    const [selectedUnit, setSelectedUnit] =
        useState(null);


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

        const selectedImage =
            Object.entries(playerImages).find(
                ([path, image]) =>
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

        const profile = {
            name: profileName.trim(),
            image: profileImage,
            imageName
        };

        setPlayerProfile(profile);


        // Find the unit corresponding
        // to the selected player image

        const ownedUnit = units.find(
            unit =>
                unit.type === "player" &&
                unit.image === profileImage
        );

        if (ownedUnit) {
            setSelectedUnit(
                ownedUnit.id
            );
        }
    }


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

            if (
                playerProfile &&
                clickedUnit.type === "player" &&
                clickedUnit.image ===
                    playerProfile.image
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

        if (
            !selected ||
            selected.type !== "player" ||
            selected.image !==
                playerProfile.image
        ) {
            return;
        }


        // Move the player's unit

        setUnits(
            units.map(unit =>
                unit.id === selectedUnit
                    ? {
                          ...unit,
                          col,
                          row
                      }
                    : unit
            )
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

                            {Object.entries(
                                playerImages
                            ).map(
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

                        {profileImage && (

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

            <svg
                width="900"
                height="650"
                viewBox="0 0 900 650"
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
                                style={{
                                    cursor:
                                        "pointer"
                                }}
                            />
                        );
                    })
                )}


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

        </div>
    );
}

export default Game;