/* global process */

import { createServer } from "node:http";
import {
    readFileSync,
    renameSync,
    unlinkSync,
    writeFileSync
} from "node:fs";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT || 3001);
const STATE_FILE = new URL("./board-state.json", import.meta.url);
const clients = new Map();

function loadBoardState() {
    try {
        const savedState = JSON.parse(
            readFileSync(STATE_FILE, "utf8")
        );

        return Array.isArray(savedState.units)
            ? savedState.units
            : null;
    } catch {
        return null;
    }
}

function saveBoardState() {
    if (!Array.isArray(boardUnits)) {
        return;
    }

    const temporaryStateFile = new URL(
        "./board-state.json.tmp",
        import.meta.url
    );

    writeFileSync(
        temporaryStateFile,
        JSON.stringify({ units: boardUnits }, null, 2),
        "utf8"
    );

    try {
        renameSync(temporaryStateFile, STATE_FILE);
    } catch (error) {
        if (error.code !== "EPERM" && error.code !== "EEXIST") {
            throw error;
        }

        unlinkSync(STATE_FILE);
        renameSync(temporaryStateFile, STATE_FILE);
    }
}

let boardUnits = loadBoardState();
let nextPlayerId = 1;

const httpServer = createServer((request, response) => {
    response.writeHead(200, { "Content-Type": "text/plain" });
    response.end("Reforged RPG multiplayer server");
});

const websocketServer = new WebSocketServer({
    server: httpServer,
    path: "/ws"
});

function sendState() {
    const message = JSON.stringify({
        type: "state",
        units: boardUnits,
        players: Array.from(clients.values())
            .filter(client => client.profile)
            .map(client => client.profile)
    });

    websocketServer.clients.forEach(client => {
        if (client.readyState === 1) {
            client.send(message);
        }
    });
}

function isValidPosition(value) {
    return Number.isInteger(value) && value >= 0;
}

function mergeTokenAbilities(incomingUnits) {
    if (!Array.isArray(boardUnits) || !Array.isArray(incomingUnits)) {
        return;
    }

    incomingUnits.forEach(incomingUnit => {
        const savedUnit = boardUnits.find(
            unit => unit.id === incomingUnit.id
        );

        if (
            savedUnit &&
            !Array.isArray(savedUnit.abilities) &&
            Array.isArray(incomingUnit.abilities)
        ) {
            savedUnit.abilities = incomingUnit.abilities;
        }
    });
}

websocketServer.on("connection", socket => {
    const client = {
        id: `player-${nextPlayerId++}`,
        profile: null
    };

    clients.set(socket, client);

    socket.send(JSON.stringify({
        type: "state",
        units: boardUnits,
        players: Array.from(clients.values())
            .filter(connectedClient => connectedClient.profile)
            .map(connectedClient => connectedClient.profile)
    }));

    socket.on("message", rawMessage => {
        let message;

        try {
            message = JSON.parse(rawMessage.toString());
        } catch {
            return;
        }

        if (message.type === "join") {
            if (!message.profile) {
                return;
            }

            const isGameMaster =
                message.profile.role === "game-master";

            if (!isGameMaster && !message.profile.unitId) {
                return;
            }

            const claimedByAnotherPlayer = Array.from(clients.values()).some(
                connectedClient =>
                    connectedClient !== client &&
                    (isGameMaster
                        ? connectedClient.profile?.role === "game-master"
                        : connectedClient.profile?.unitId === message.profile.unitId)
            );

            if (claimedByAnotherPlayer) {
                socket.send(JSON.stringify({
                    type: "error",
                    message: isGameMaster
                        ? "A Game Master is already connected."
                        : "That token is already being used. Choose another token."
                }));
                return;
            }

            if (!boardUnits && Array.isArray(message.units)) {
                boardUnits = message.units;
                saveBoardState();
            } else {
                mergeTokenAbilities(message.units);
                saveBoardState();
            }

            client.profile = {
                id: client.id,
                name: String(message.profile.name || "Player"),
                image: String(message.profile.image || ""),
                imageName: String(message.profile.imageName || ""),
                unitId: isGameMaster
                    ? null
                    : String(message.profile.unitId),
                role: isGameMaster ? "game-master" : "player"
            };

            sendState();
            return;
        }

        if (
            message.type !== "move" &&
            message.type !== "add-ability" &&
            message.type !== "remove-ability" &&
            message.type !== "update-ability-status"
        ) {
            return;
        }

        if (!client.profile || !Array.isArray(boardUnits)) {
            if (
                message.type === "move" ||
                !client.profile ||
                client.profile.role !== "player" ||
                !Array.isArray(boardUnits)
            ) {
                return;
            }
        }

        if (
            message.type === "add-ability" ||
            message.type === "remove-ability" ||
            message.type === "update-ability-status"
        ) {
            if (
                client.profile.role !== "player" ||
                message.targetUnitId !== client.profile.unitId
            ) {
                return;
            }

            const targetUnit = boardUnits.find(
                unit => unit.id === message.targetUnitId
            );

            if (
                !targetUnit ||
                targetUnit.type !== "player" ||
                (message.type === "add-ability" &&
                    (typeof message.ability?.name !== "string" ||
                        typeof message.ability?.markdown !== "string")) ||
                (message.type === "remove-ability" &&
                    typeof message.abilityName !== "string") ||
                (message.type === "update-ability-status" &&
                    (typeof message.abilityName !== "string" ||
                        !["whole", "broken", "reforged"].includes(message.status)))
            ) {
                return;
            }

            const abilities = Array.isArray(targetUnit.abilities)
                ? targetUnit.abilities
                : [];

            if (message.type === "remove-ability") {
                targetUnit.abilities = abilities.filter(
                    ability => ability.name !== message.abilityName
                );
            } else if (message.type === "update-ability-status") {
                targetUnit.abilities = abilities.map(ability =>
                    ability.name === message.abilityName
                        ? { ...ability, status: message.status }
                        : ability
                );
            } else {
                if (abilities.some(ability =>
                    ability.name === message.ability.name
                )) {
                    return;
                }

                targetUnit.abilities = [
                    ...abilities,
                    {
                        name: message.ability.name,
                        markdown: message.ability.markdown,
                        status: "whole"
                    }
                ];
            }
            saveBoardState();
            sendState();
            return;
        }

        const isGameMaster = client.profile.role === "game-master";

        if (
            (!isGameMaster && message.unitId !== client.profile.unitId) ||
            !isValidPosition(message.col) ||
            !isValidPosition(message.row)
        ) {
            return;
        }

        const unit = boardUnits.find(item => item.id === message.unitId);

        if (!unit || (!isGameMaster && unit.type !== "player")) {
            return;
        }

        const occupied = boardUnits.some(item =>
            item.id !== unit.id &&
            item.col === message.col &&
            item.row === message.row
        );

        if (occupied) {
            return;
        }

        unit.col = message.col;
        unit.row = message.row;
        saveBoardState();
        sendState();
    });

    socket.on("close", () => {
        clients.delete(socket);
        sendState();
    });
});

httpServer.listen(PORT, () => {
    console.log(`Multiplayer server listening on http://localhost:${PORT}`);
});
