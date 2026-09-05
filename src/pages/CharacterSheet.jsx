import { useEffect, useRef, useState } from "react";

const PROFILE_SESSION_KEY = "rrpg-profile-session";

const masteryFields = [
    "Shield Training",
    "Heavy Weapons Training",
    "Light Weapons Training",
    "Dual Weapons Training",
    "Long Ranged Weapons Training",
    "Arcane Energy",
    "Dark Power",
    "Magical Secrets",
    "Dramatic Flair",
    "Faith",
    "Natural Connection",
    "Creature Familiarity"
];

const defaultCharacterSheet = {
    body: 5,
    mind: 5,
    soul: 5,
    movement: 5,
    toughness: 0,
    mastery: Object.fromEntries(
        masteryFields.map(field => [field, 0])
    ),
    socialContexts: [""],
    characteristics: [""],
    foreshadowing: "",
    destiny: "",
    equipment: ""
};

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

function createDefaultSheet() {
    return {
        ...defaultCharacterSheet,
        mastery: { ...defaultCharacterSheet.mastery },
        socialContexts: [""],
        characteristics: [""]
    };
}

function CharacterSheet() {
    const [profile] = useState(getStoredProfile);
    const socketRef = useRef(null);
    const pendingSheetRef = useRef(null);
    const [characterSheet, setCharacterSheet] = useState(
        createDefaultSheet
    );
    const [playerUnit, setPlayerUnit] = useState(null);
    const [sheetLoaded, setSheetLoaded] = useState(() => !profile);
    const [connectionError, setConnectionError] = useState("");
    const [saveStatus, setSaveStatus] = useState("");
    const reconnectTimeoutRef = useRef(null);

    const canEdit = profile?.role === "player" &&
        Boolean(profile.unitId);

    useEffect(() => {
        if (!profile) {
            return undefined;
        }

        const websocketUrl =
            import.meta.env.VITE_WS_URL ||
            `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`;
        let disposed = false;

        function connect() {
            if (disposed) {
                return;
            }

            const characterSheetSocket = new WebSocket(websocketUrl);
            socketRef.current = characterSheetSocket;

            characterSheetSocket.addEventListener("open", () => {
                setConnectionError("");
                characterSheetSocket.send(JSON.stringify({
                    type: "join",
                    profile
                }));

                if (pendingSheetRef.current) {
                    characterSheetSocket.send(JSON.stringify({
                        type: "update-character-sheet",
                        targetUnitId: profile.unitId,
                        characterSheet: pendingSheetRef.current
                    }));
                    setSaveStatus("Saving...");
                }
            });

            characterSheetSocket.addEventListener("message", event => {
                let message;

                try {
                    message = JSON.parse(event.data);
                } catch {
                    return;
                }

                if (message.type === "error") {
                    setConnectionError(message.message || "Unable to load character sheet");
                    setSheetLoaded(true);
                    return;
                }

                if (message.type === "character-sheet-saved") {
                    pendingSheetRef.current = null;
                    setSaveStatus("Saved");
                    return;
                }

                if (message.type !== "state" || !Array.isArray(message.units)) {
                    return;
                }

                const playerUnit = message.units.find(
                    unit => unit.id === profile.unitId
                );

                setPlayerUnit(playerUnit || null);

                if (playerUnit?.characterSheet) {
                    setCharacterSheet({
                        ...createDefaultSheet(),
                        ...playerUnit.characterSheet,
                        mastery: {
                            ...createDefaultSheet().mastery,
                            ...(playerUnit.characterSheet.mastery || {})
                        },
                        socialContexts: Array.isArray(
                            playerUnit.characterSheet.socialContexts
                        ) && playerUnit.characterSheet.socialContexts.length > 0
                            ? playerUnit.characterSheet.socialContexts
                            : [""],
                        characteristics: Array.isArray(
                            playerUnit.characterSheet.characteristics
                        ) && playerUnit.characterSheet.characteristics.length > 0
                            ? playerUnit.characterSheet.characteristics
                            : [""]
                    });
                }

                setSheetLoaded(true);
            });

            characterSheetSocket.addEventListener("error", () => {
                setConnectionError("Character sheet connection failed. Retrying...");
                setSheetLoaded(true);
            });

            characterSheetSocket.addEventListener("close", () => {
                if (socketRef.current === characterSheetSocket) {
                    socketRef.current = null;
                }

                if (!disposed) {
                    reconnectTimeoutRef.current = window.setTimeout(connect, 2000);
                }
            });
        }

        connect();

        return () => {
            disposed = true;
            window.clearTimeout(reconnectTimeoutRef.current);
            socketRef.current?.close();
            socketRef.current = null;
        };
    }, [profile]);

    function updateSheet(nextSheet) {
        setCharacterSheet(nextSheet);
        setSaveStatus("Unsaved changes");
        pendingSheetRef.current = nextSheet;

        const activeSocket = socketRef.current;

        if (
            !canEdit ||
            activeSocket?.readyState !== WebSocket.OPEN
        ) {
            return;
        }

        activeSocket.send(JSON.stringify({
            type: "update-character-sheet",
            targetUnitId: profile.unitId,
            characterSheet: nextSheet
        }));
    }

    function saveSheet() {
        const activeSocket = socketRef.current;

        if (
            !canEdit ||
            activeSocket?.readyState !== WebSocket.OPEN
        ) {
            setSaveStatus("Unable to save while offline");
            return;
        }

        activeSocket.send(JSON.stringify({
            type: "update-character-sheet",
            targetUnitId: profile.unitId,
            characterSheet
        }));
        setSaveStatus("Saving...");
    }

    function updateIntegerField(field, value) {
        updateSheet({
            ...characterSheet,
            [field]: value === "" ? "" : Number(value)
        });
    }

    function updateMasteryField(field, value) {
        updateSheet({
            ...characterSheet,
            mastery: {
                ...characterSheet.mastery,
                [field]: value === "" ? "" : Number(value)
            }
        });
    }

    function updateLine(field, index, value) {
        updateSheet({
            ...characterSheet,
            [field]: characterSheet[field].map((line, lineIndex) =>
                lineIndex === index ? value : line
            )
        });
    }

    function addLine(field) {
        updateSheet({
            ...characterSheet,
            [field]: [...characterSheet[field], ""]
        });
    }

    if (!profile || !canEdit) {
        return (
            <div className="character-sheet-page">
                <h1>Character Sheet</h1>
                <p>Log in as a player to view your character sheet.</p>
            </div>
        );
    }

    if (!sheetLoaded) {
        return (
            <div className="character-sheet-page">
                <h1>Character Sheet</h1>
                <p>Loading character sheet...</p>
            </div>
        );
    }

    return (
        <div className="character-sheet-page">
            <div className="character-sheet-header">
                {profile.image && (
                    <img
                        className="character-sheet-token-image"
                        src={profile.image}
                        alt={profile.imageName || "Player token"}
                    />
                )}
                <div>
                    <h2>{playerUnit?.name || profile.imageName}</h2>
                    <p>{profile.name}</p>
                </div>
            </div>

            <div className="character-sheet-save-bar">
                <button
                    className="character-sheet-save-button"
                    type="button"
                    onClick={saveSheet}
                >
                    Save
                </button>
                {saveStatus && <span>{saveStatus}</span>}
            </div>

            {connectionError && (
                <p className="character-sheet-error">{connectionError}</p>
            )}

            <div className="character-sheet-section">
                <div className="character-sheet-field-grid">
                    {[
                        ["Body", "body"],
                        ["Mind", "mind"],
                        ["Soul", "soul"],
                        ["Movement", "movement"],
                        ["Toughness", "toughness"]
                    ].map(([label, field]) => (
                        <label key={field}>
                            {label}
                            <input
                                className="character-sheet-integer-input"
                                type="number"
                                min="0"
                                max="99"
                                step="1"
                                value={characterSheet[field]}
                                onChange={event =>
                                    updateIntegerField(field, event.target.value)
                                }
                            />
                        </label>
                    ))}
                </div>
            </div>

            <div className="character-sheet-section">
                <h2>Mastery</h2>
                <div className="character-sheet-field-grid">
                    {masteryFields.map(field => (
                        <label key={field}>
                            {field}
                            <input
                                className="character-sheet-integer-input"
                                type="number"
                                min="0"
                                max="99"
                                step="1"
                                value={characterSheet.mastery[field]}
                                onChange={event =>
                                    updateMasteryField(field, event.target.value)
                                }
                            />
                        </label>
                    ))}
                </div>
            </div>

            <div className="character-sheet-section">
                <h2>Social Contexts</h2>
                {characterSheet.socialContexts.map((line, index) => (
                    <input
                        className="character-sheet-text-input"
                        key={`social-context-${index}`}
                        type="text"
                        value={line}
                        onChange={event =>
                            updateLine("socialContexts", index, event.target.value)
                        }
                    />
                ))}
                <button type="button" onClick={() => addLine("socialContexts")}>
                    +
                </button>
            </div>

            <div className="character-sheet-section">
                <h2>Characteristics</h2>
                {characterSheet.characteristics.map((line, index) => (
                    <input
                        className="character-sheet-text-input"
                        key={`characteristic-${index}`}
                        type="text"
                        value={line}
                        onChange={event =>
                            updateLine("characteristics", index, event.target.value)
                        }
                    />
                ))}
                <button type="button" onClick={() => addLine("characteristics")}>
                    +
                </button>
            </div>

            {[
                ["Foreshadowing", "foreshadowing"],
                ["Destiny", "destiny"],
                ["Equipment", "equipment"]
            ].map(([label, field]) => (
                <div className="character-sheet-section" key={field}>
                    <h2>{label}</h2>
                    {field === "equipment" ? (
                        <textarea
                            className="character-sheet-equipment"
                            value={characterSheet[field]}
                            onChange={event =>
                                updateSheet({
                                    ...characterSheet,
                                    [field]: event.target.value
                                })
                            }
                        />
                    ) : (
                        <input
                            className="character-sheet-text-input"
                            type="text"
                            value={characterSheet[field]}
                            onChange={event =>
                                updateSheet({
                                    ...characterSheet,
                                    [field]: event.target.value
                                })
                            }
                        />
                    )}
                </div>
            ))}
        </div>
    );
}

export default CharacterSheet;