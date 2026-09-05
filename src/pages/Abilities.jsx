import { useMemo, useState } from "react";
import { useEffect } from "react";
import ReactMarkdown from "react-markdown";

const PROFILE_SESSION_KEY = "rrpg-profile-session";

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

const requirementGroups = [
    {
        category: "Base Abilities",
        label: "Primary Abilities",
        requirements: []
    },
    {
        category: "Secondary Abilities",
        label: "Secondary Abilities",
        requirements: []
    },
    { category: "The Elements", requirements: [] },
    { category: "Taming", requirements: [] },
    { category: "Necromancy", requirements: [] },
    { category: "Performance", requirements: [] },
    { category: "Dual Wielding", requirements: [] },
    { category: "Justice and Mercy", requirements: [] },
    { category: "Heavy", requirements: [] },
    { category: "Light", requirements: [] },
    { category: "Long Ranged", requirements: [] },
    { category: "Craftsfolk", requirements: [] },
    { category: "Fae-Touched", requirements: [] },
    { category: "War-like", requirements: [] },
    { category: "Diminutive", requirements: [] },
    { category: "Undead", requirements: [] },
    { category: "Illusions", requirements: [] },
    { category: "Animal Form", requirements: [] },
    { category: "Shield", requirements: [] }
];

const filterSections = [
    {
        label: "Base Abilities",
        categories: ["Base Abilities", "Secondary Abilities"]
    },
    {
        label: "Race Abilities",
        categories: [
            "Craftsfolk",
            "Diminutive",
            "War-like",
            "Fae-Touched",
            "Undead"
        ]
    },
    {
        label: "Class Abilities",
        categories: [
            "The Elements",
            "Taming",
            "Necromancy",
            "Performance",
            "Dual Wielding",
            "Justice and Mercy",
            "Heavy",
            "Light",
            "Long Ranged",
            "Illusions",
            "Animal Form",
            "Shield"
        ]
    }
];

const baseAbilityCategories = [
    "Base Abilities",
    "Secondary Abilities"
];

const abilityFiles = import.meta.glob(
    "../assets/abilities/Ability List.md",//"../assets/abilities/**/*.md",
    {
        eager: true,
        query: "?raw",
        import: "default"
    }
);


// Split a Markdown file into abilities while retaining each parent section.
function parseAbilities(markdown) {
    const abilities = [];
    let category = "";
    let currentAbility = null;

    markdown.split("\n").forEach(line => {
        const categoryMatch = line.match(/^#\s+([^#].*?)\s*$/);
        const abilityMatch = line.match(/^##\s+(.+?)\s*$/);

        if (categoryMatch) {
            category = categoryMatch[1]
                .replace(/\*\*/g, "")
                .trim();
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
                title: abilityMatch[1]
                    .replace(/\*\*/g, "")
                    .trim(),
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
        currentAbility.content = currentAbility.content
            .join("\n")
            .trim();
        abilities.push(currentAbility);
    }

    return abilities;
}

function getRequirementNumber(ability) {
    const requirementMatch =
        ability.content.match(
            /requires\s+(?:at least\s+)?(\d+)/i
        );

    return requirementMatch
        ? Number(requirementMatch[1])
        : 0;
}

function isBaseAbility(ability) {
    return baseAbilityCategories.includes(ability.category);
}


function Abilities() {

    const [profile] = useState(getStoredProfile);

    const [socket, setSocket] =
        useState(null);

    const [tokenAbilities, setTokenAbilities] =
        useState({});

    const [abilityError, setAbilityError] =
        useState("");

    const [selectedCategory, setSelectedCategory] =
        useState("All");

    const [selectedRequirement, setSelectedRequirement] =
        useState("All");

    const [exactRequirementNumber, setExactRequirementNumber] =
        useState("");

    const canAddAbilities =
        profile?.role === "player" &&
        Boolean(profile.unitId);

    useEffect(() => {
        if (!profile) {
            return undefined;
        }

        const websocketUrl =
            import.meta.env.VITE_WS_URL ||
            `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`;
        const abilitySocket = new WebSocket(websocketUrl);

        abilitySocket.addEventListener("open", () => {
            setSocket(abilitySocket);
            abilitySocket.send(
                JSON.stringify({
                    type: "join",
                    profile
                })
            );
        });

        abilitySocket.addEventListener("message", event => {
            let message;

            try {
                message = JSON.parse(event.data);
            } catch {
                return;
            }

            if (message.type === "error") {
                setAbilityError(message.message || "Unable to add ability");
                return;
            }

            if (message.type !== "state" || !Array.isArray(message.units)) {
                return;
            }

            setTokenAbilities(
                Object.fromEntries(
                    message.units
                        .filter(unit => unit.type === "player")
                        .map(unit => [
                            unit.id,
                            Array.isArray(unit.abilities)
                                ? unit.abilities.map(ability => ability.name)
                                : []
                        ])
                )
            );
        });

        return () => {
            abilitySocket.close();
            setSocket(null);
        };
    }, [profile]);

    function updateTokenAbility(ability, shouldRemove) {
        if (
            !canAddAbilities ||
            socket?.readyState !== WebSocket.OPEN
        ) {
            return;
        }

        socket.send(
            JSON.stringify({
                type: shouldRemove
                    ? "remove-ability"
                    : "add-ability",
                targetUnitId: profile.unitId,
                abilityName: ability.title,
                ...(!shouldRemove && {
                    ability: {
                        name: ability.title,
                        markdown: `## **${ability.title}**\n\n${ability.content}`,
                            category: ability.category,
                        status: "whole"
                    }
                })
            })
        );
        setAbilityError("");
    }


    // =========================
    // PARSE ALL ABILITIES
    // =========================

    const abilities = useMemo(() => {

        return Object.entries(
            abilityFiles
        ).flatMap(([path, markdown]) => {

            return parseAbilities(markdown)
                .map(ability => ({
                    ...ability,
                    file: path
                }));
        });

    }, []);

    const orderedAbilities = useMemo(() => {
        return abilities
            .map((ability, index) => ({
                ability,
                index
            }))
            .sort((first, second) => {
                const requirementDifference =
                    getRequirementNumber(first.ability) -
                    getRequirementNumber(second.ability);

                return requirementDifference ||
                    first.index - second.index;
            })
            .map(entry => entry.ability);
    }, [abilities]);


    // =========================
    // FILTER ABILITIES
    // =========================

    const filteredAbilities =
        useMemo(() => {

            if (
                selectedCategory === "All" &&
                !exactRequirementNumber
            ) {
                return orderedAbilities;
            }

            const selectedGroup =
                requirementGroups.find(
                    group => group.category === selectedCategory
                );

            const requirements =
                selectedCategory === "All"
                    ? requirementGroups.flatMap(
                        group => group.requirements
                    )
                    : selectedRequirement === "All"
                        ? selectedGroup?.requirements || []
                        : [selectedRequirement];

            const exactNumber = Number(exactRequirementNumber);

            return orderedAbilities.filter(
                ability => {
                    const categoryMatches =
                        selectedCategory === "All" ||
                        ability.category === selectedCategory;

                    if (!categoryMatches) {
                        return false;
                    }

                    if (
                        exactRequirementNumber &&
                        getRequirementNumber(ability) !== exactNumber
                    ) {
                        return false;
                    }

                    if (requirements.length === 0) {
                        return true;
                    }

                    return requirements.some(requirement => {
                        const escapedRequirement =
                            requirement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

                        const requirementMatch =
                            ability.content.match(
                                new RegExp(
                                    `requires\\s+(?:at least\\s+)?(\\d+)\\s+${escapedRequirement}\\b`,
                                    "i"
                                )
                            );

                        if (!requirementMatch) {
                            return false;
                        }

                        return !exactRequirementNumber ||
                            Number(requirementMatch[1]) === exactNumber;
                    });
                }
            );

        }, [
            orderedAbilities,
            selectedCategory,
            selectedRequirement,
            exactRequirementNumber
        ]);


    return (
        <div className="abilities-page">

            {/* ========================= */}
            {/* FILTER BAR                 */}
            {/* ========================= */}

            <div className="ability-filters">
                {filterSections.map(section => (
                    <section
                        className="ability-filter-section"
                        key={section.label}
                    >
                        <h2>{section.label}</h2>

                        <div className="ability-filter-group">
                            {section.categories.map(category => {
                                const group = requirementGroups.find(
                                    entry => entry.category === category
                                );

                                return (
                                    <div
                                        key={group.category}
                                        className="ability-filter-category"
                                    >
                                        <button
                                            className={
                                                selectedCategory === group.category &&
                                                selectedRequirement === "All"
                                                    ? "ability-filter active"
                                                    : "ability-filter"
                                            }
                                            onClick={() => {
                                                setSelectedCategory(group.category);
                                                setSelectedRequirement("All");
                                            }}
                                        >
                                            {group.label || group.category}
                                        </button>

                                        {group.requirements.map(requirement => (
                            <button
                                className={
                                    selectedCategory === group.category &&
                                    selectedRequirement === requirement
                                        ? "ability-filter requirement active"
                                        : "ability-filter requirement"
                                }
                                key={requirement}
                                onClick={() => {
                                    setSelectedCategory(group.category);
                                    setSelectedRequirement(requirement);
                                }}
                            >
                                {requirement}
                            </button>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                ))}

                <label className="ability-requirement-input">
                    Exact requirement number
                    <input
                        type="number"
                        min="1"
                        step="1"
                        value={exactRequirementNumber}
                        onChange={event =>
                            setExactRequirementNumber(event.target.value)
                        }
                        placeholder="Any"
                    />
                </label>

            </div>

            {/* ========================= */}
            {/* ABILITIES                  */}

            <div className="abilities-list">

                {abilityError && (
                    <p className="ability-assignment-error">
                        {abilityError}
                    </p>
                )}

                {filteredAbilities.length === 0 ? (
                    <p>
                        No abilities match this filter.
                    </p>
                ) : (
                    filteredAbilities.map(
                        (ability, index) => {
                            const abilityAlreadyAdded =
                                tokenAbilities[profile?.unitId]?.includes(
                                    ability.title
                                );

                            return (
                            <section
                                className="ability-section"
                                key={
                                    `${ability.file}-${index}`
                                }
                            >
                                <ReactMarkdown
                                    components={{
                                        h1: () => null
                                    }}
                                >
                                    {`## ${ability.title}\n\n${ability.content}`}
                                </ReactMarkdown>

                                {!isBaseAbility(ability) && (
                                    <div className="ability-assignment-controls">
                                        <button
                                            type="button"
                                            className={
                                                abilityAlreadyAdded
                                                    ? "add-ability-button remove-ability-button"
                                                    : "add-ability-button"
                                            }
                                            disabled={!canAddAbilities}
                                            onClick={() =>
                                                updateTokenAbility(
                                                    ability,
                                                    abilityAlreadyAdded
                                                )
                                            }
                                        >
                                            {abilityAlreadyAdded
                                                ? "Remove ability"
                                                : "Add ability"}
                                        </button>
                                    </div>
                                )}
                            </section>
                            );
                        }
                    )
                )}

            </div>

        </div>
    );
}

export default Abilities;