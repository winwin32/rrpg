import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

const secondaryAbilities = [
    "Sneak",
    "Familiarity",
    "Demonstrate",
    "Inquire",
    "Expound",
    "Persuade",
    "Navigate",
    "Scout",
    "Forage"
];

const baseAbilityNames = [
    "Attack",
    "Move",
    "Flee",
    "Recover",
    ...secondaryAbilities
];

const abilityFiles = import.meta.glob(
    "../assets/abilities/Ability List.md",
    {
        eager: true,
        query: "?raw",
        import: "default"
    }
);

const defaultCharacterSheet = {
    body: 5,
    mind: 5,
    soul: 5,
    movement: 5,
    toughness: 0,
    backgroundStat: "Body",
    backgroundSecondaryAbility: "Sneak",
    mastery: Object.fromEntries(
        masteryFields.map(field => [field, 0])
    ),
    socialContexts: [""],
    characteristics: [{ text: "", mastery: "" }],
    foreshadowedAbility: "",
    oneUniqueThing: "",
    destiny: "",
    equipment: "",
    additionalDetails: ""
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
        characteristics: [{ text: "", mastery: "" }]
    };
}

function normalizeCharacteristics(characteristics) {
    if (!Array.isArray(characteristics) || characteristics.length === 0) {
        return [{ text: "", mastery: "" }];
    }

    return characteristics.map(characteristic =>
        typeof characteristic === "string"
            ? { text: characteristic, mastery: "" }
            : {
                text: characteristic?.text || "",
                mastery: characteristic?.mastery || ""
            }
    );
}

function parseBaseAbilities(markdown) {
    const abilities = [];
    let category = "";
    let currentAbility = null;

    markdown.split("\n").forEach(line => {
        const categoryMatch = line.match(/^#\s+([^#].*?)\s*$/);
        const abilityMatch = line.match(/^##\s+(.+?)\s*$/);

        if (categoryMatch) {
            category = categoryMatch[1].trim();
            return;
        }

        if (abilityMatch) {
            if (currentAbility) {
                currentAbility.content = currentAbility.content
                    .join("\n")
                    .trim();
                abilities.push(currentAbility);
            }

            currentAbility = {
                name: abilityMatch[1].replace(/\*\*/g, "").trim(),
                category,
                content: []
            };
            return;
        }

        if (currentAbility) {
            currentAbility.content.push(line);
        }
    });

    if (currentAbility) {
        currentAbility.content = currentAbility.content.join("\n").trim();
        abilities.push(currentAbility);
    }

    return abilities.filter(ability =>
        ["Base Abilities", "Secondary Abilities"].includes(
            ability.category
        )
    );
}

const baseAbilityDefinitions = Object.values(abilityFiles)
    .flatMap(parseBaseAbilities);

function isBaseAbility(ability) {
    return ["Base Abilities", "Secondary Abilities"].includes(
        ability.category
    ) || baseAbilityNames.includes(ability.name);
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

    const savedAbilities = Array.isArray(playerUnit?.abilities)
        ? playerUnit.abilities
        : [];
    const savedAbilitiesByName = new Map(
        savedAbilities.map(ability => [ability.name, ability])
    );
    const baseAbilities = baseAbilityDefinitions.map(ability => {
        const savedAbility = savedAbilitiesByName.get(ability.name);

        return {
            name: ability.name,
            category: ability.category,
            status: savedAbility?.status || "whole",
            markdown: `## ${ability.name}\n\n${ability.content}`
        };
    });
    const classAbilities = savedAbilities.filter(
        ability => !isBaseAbility(ability)
    );

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
                    const savedSheet = playerUnit.characterSheet;

                    setCharacterSheet({
                        ...createDefaultSheet(),
                        ...savedSheet,
                        foreshadowedAbility:
                            savedSheet.foreshadowedAbility ||
                            savedSheet.foreshadowing ||
                            "",
                        mastery: {
                            ...createDefaultSheet().mastery,
                            ...(savedSheet.mastery || {})
                        },
                        socialContexts: Array.isArray(
                            savedSheet.socialContexts
                        ) && savedSheet.socialContexts.length > 0
                            ? savedSheet.socialContexts
                            : [""],
                        characteristics: normalizeCharacteristics(
                            savedSheet.characteristics
                        )
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

    function getAbilityStatus(ability) {
        return ability.status || "whole";
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

    function updateCharacteristic(index, field, value) {
        updateSheet({
            ...characterSheet,
            characteristics: characterSheet.characteristics.map(
                (characteristic, characteristicIndex) =>
                    characteristicIndex === index
                        ? { ...characteristic, [field]: value }
                        : characteristic
            )
        });
    }

    function addLine(field) {
        updateSheet({
            ...characterSheet,
            [field]: [
                ...characterSheet[field],
                field === "characteristics"
                    ? { text: "", mastery: "" }
                    : ""
            ]
        });
    }

    function renderSavedAbility(ability) {
        const abilityLines = ability.markdown.split(/\r?\n/);
        const abilityDetails = abilityLines.slice(1).join("\n").trim();
        const status = getAbilityStatus(ability);

        return (
            <section
                key={ability.name}
                className={`ability-entry ability-${status}`}
            >
                <div className="ability-heading-row">
                    <h2>{ability.name}</h2>
                </div>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {abilityDetails}
                </ReactMarkdown>
            </section>
        );
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

            <div className="character-sheet-top-grid">
                <div className="character-sheet-section">
                    <h2>Background</h2>
                    <label className="character-sheet-select-row">
                        +1 to stat
                        <select
                            value={characterSheet.backgroundStat}
                            onChange={event =>
                                updateSheet({
                                    ...characterSheet,
                                    backgroundStat: event.target.value
                                })
                            }
                        >
                            <option value="Body">+1 Body</option>
                            <option value="Mind">+1 Mind</option>
                            <option value="Soul">+1 Soul</option>
                        </select>
                    </label>
                    <label className="character-sheet-select-row">
                        +1 to Secondary Ability
                        <select
                            value={characterSheet.backgroundSecondaryAbility}
                            onChange={event =>
                                updateSheet({
                                    ...characterSheet,
                                    backgroundSecondaryAbility: event.target.value
                                })
                            }
                        >
                            {secondaryAbilities.map(ability => (
                                <option key={ability} value={ability}>
                                    {ability}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>

                <div className="character-sheet-section">
                    <div className="character-sheet-stat-list">
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
                {characterSheet.characteristics.map((characteristic, index) => (
                    <div className="character-sheet-characteristic-row" key={`characteristic-${index}`}>
                        <input
                            className="character-sheet-text-input"
                            type="text"
                            value={characteristic.text}
                            onChange={event =>
                                updateCharacteristic(index, "text", event.target.value)
                            }
                        />
                        <select
                            value={characteristic.mastery}
                            onChange={event =>
                                updateCharacteristic(index, "mastery", event.target.value)
                            }
                        >
                            <option value="">Choose mastery</option>
                            {masteryFields.map(mastery => (
                                <option key={mastery} value={mastery}>
                                    {mastery}
                                </option>
                            ))}
                        </select>
                    </div>
                ))}
                <button type="button" onClick={() => addLine("characteristics")}>
                    +
                </button>
            </div>

            {[
                ["Foreshadowed Ability", "foreshadowedAbility"],
                ["One Unique Thing", "oneUniqueThing"],
                ["Destiny", "destiny"],
                ["Equipment", "equipment"],
                ["Additional Details", "additionalDetails"]
            ].map(([label, field]) => (
                <div className="character-sheet-section" key={field}>
                    <h2>{label}</h2>
                    {field === "equipment" || field === "additionalDetails" ? (
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

            {[
                ["Class Abilities", classAbilities],
                ["Base Abilities", baseAbilities]
            ].map(([label, base]) => {
                const abilities = Array.isArray(base)
                    ? base
                    : [];

                return (
                    <div className="character-sheet-section character-sheet-abilities-section" key={label}>
                        <h2>{label}</h2>
                        {abilities.length === 0 ? (
                            <p className="empty-ability-list">No abilities available</p>
                        ) : (
                            abilities.map(renderSavedAbility)
                        )}
                    </div>
                );
            })}
        </div>
    );
}

export default CharacterSheet;