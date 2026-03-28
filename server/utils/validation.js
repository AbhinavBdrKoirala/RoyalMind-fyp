const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[+]?[0-9()\-\s]{7,20}$/;
const PIECE_REGEX = /^[wb][prnbqk]$/;

const SETTINGS_SPEC = {
    language: ["English", "Spanish", "French"],
    timeZone: ["Local device time", "UTC", "Asia/Kathmandu"],
    autoQueen: "boolean",
    showLegal: "boolean",
    moveConfirm: "boolean",
    defaultTime: ["Rapid 10+0", "Blitz 5+0", "Blitz 3+2", "Classical 30+0"],
    boardTheme: ["Emerald", "Classic Wood", "Slate"],
    pieceStyle: ["Royal Set", "Modern", "Minimal"],
    boardCoordinates: ["Show on all games", "Show when playing", "Hide"],
    animatePieces: "boolean",
    notifyGameStart: "boolean",
    notifyChallenges: "boolean",
    notifySounds: "boolean",
    privacyOnline: "boolean",
    privacyDM: "boolean",
    privacyHistory: "boolean"
};

const SETTINGS_KEYS = Object.keys(SETTINGS_SPEC);

function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeRequiredString(value) {
    return String(value || "").trim();
}

function normalizeOptionalString(value, maxLength) {
    if (typeof value === "undefined" || value === null) {
        return "";
    }

    const normalized = String(value).trim();
    if (!normalized) {
        return "";
    }

    return maxLength ? normalized.slice(0, maxLength) : normalized;
}

function validateRegisterPayload(input) {
    const firstName = normalizeRequiredString(input?.firstName);
    const lastName = normalizeRequiredString(input?.lastName);
    const username = normalizeRequiredString(input?.username);
    const phone = normalizeRequiredString(input?.phone);
    const country = normalizeRequiredString(input?.country);
    const email = normalizeRequiredString(input?.email).toLowerCase();
    const password = String(input?.password || "");

    if (!firstName || !lastName || !username || !phone || !country || !email || !password) {
        return { ok: false, error: "Please fill all required fields" };
    }

    if (password.length < 8) {
        return { ok: false, error: "Password must be at least 8 characters long" };
    }

    if (!PHONE_REGEX.test(phone)) {
        return { ok: false, error: "Invalid phone number format" };
    }

    if (!EMAIL_REGEX.test(email)) {
        return { ok: false, error: "Invalid email format" };
    }

    const displayName = username || `${firstName} ${lastName}`.trim() || email;

    return {
        ok: true,
        value: {
            firstName,
            lastName,
            username,
            phone,
            country,
            email,
            password,
            displayName
        }
    };
}

function validateLoginPayload(input) {
    const email = normalizeRequiredString(input?.email).toLowerCase();
    const password = String(input?.password || "");

    if (!email || !password) {
        return { ok: false, error: "Email and password are required" };
    }

    if (!EMAIL_REGEX.test(email)) {
        return { ok: false, error: "Invalid email format" };
    }

    return {
        ok: true,
        value: {
            email,
            password
        }
    };
}

function sanitizeSettings(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const output = {};

    for (const key of SETTINGS_KEYS) {
        const value = safeInput[key];

        if (typeof value === "undefined") {
            continue;
        }

        const rule = SETTINGS_SPEC[key];

        if (rule === "boolean") {
            if (typeof value !== "boolean") {
                return { ok: false, error: `Invalid value for ${key}` };
            }
            output[key] = value;
            continue;
        }

        if (!rule.includes(value)) {
            return { ok: false, error: `Invalid value for ${key}` };
        }

        output[key] = value;
    }

    return { ok: true, value: output };
}

function validateSettingsPayload(input) {
    const displayName = normalizeOptionalString(input?.displayName, 120);
    const settingsResult = sanitizeSettings(input?.settings);

    if (!settingsResult.ok) {
        return settingsResult;
    }

    return {
        ok: true,
        value: {
            displayName,
            settings: settingsResult.value
        }
    };
}

function isValidBoardIndex(value) {
    return Number.isInteger(value) && value >= 0 && value <= 7;
}

function isValidPiece(value) {
    return typeof value === "string" && PIECE_REGEX.test(value);
}

function validateMoveObject(move, index) {
    if (!isPlainObject(move)) {
        return { ok: false, error: `Move ${index + 1} must be an object` };
    }

    const requiredIndices = ["fromRow", "fromCol", "toRow", "toCol"];
    for (const key of requiredIndices) {
        if (!isValidBoardIndex(move[key])) {
            return { ok: false, error: `Move ${index + 1} has an invalid ${key}` };
        }
    }

    if (!isValidPiece(move.piece)) {
        return { ok: false, error: `Move ${index + 1} has an invalid piece` };
    }

    if (move.captured !== null && typeof move.captured !== "undefined" && !isValidPiece(move.captured)) {
        return { ok: false, error: `Move ${index + 1} has an invalid captured piece` };
    }

    if (move.promotedTo !== null && typeof move.promotedTo !== "undefined" && !isValidPiece(move.promotedTo)) {
        return { ok: false, error: `Move ${index + 1} has an invalid promoted piece` };
    }

    if (typeof move.notation !== "undefined" && typeof move.notation !== "string") {
        return { ok: false, error: `Move ${index + 1} has an invalid notation` };
    }

    if (typeof move.enPassantCapture !== "undefined" && move.enPassantCapture !== null) {
        if (
            !isPlainObject(move.enPassantCapture) ||
            !isValidBoardIndex(move.enPassantCapture.row) ||
            !isValidBoardIndex(move.enPassantCapture.col) ||
            !isValidPiece(move.enPassantCapture.piece)
        ) {
            return { ok: false, error: `Move ${index + 1} has an invalid en passant capture` };
        }
    }

    if (typeof move.rookMove !== "undefined" && move.rookMove !== null) {
        if (
            !isPlainObject(move.rookMove) ||
            !isValidBoardIndex(move.rookMove.fromRow) ||
            !isValidBoardIndex(move.rookMove.fromCol) ||
            !isValidBoardIndex(move.rookMove.toRow) ||
            !isValidBoardIndex(move.rookMove.toCol) ||
            !isValidPiece(move.rookMove.piece)
        ) {
            return { ok: false, error: `Move ${index + 1} has an invalid rook move` };
        }
    }

    return { ok: true };
}

function validateMoves(moves) {
    if (typeof moves === "undefined") {
        return { ok: true, value: undefined };
    }

    if (!Array.isArray(moves)) {
        return { ok: false, error: "Moves must be an array" };
    }

    if (moves.length > 1000) {
        return { ok: false, error: "Moves payload is too large" };
    }

    for (let index = 0; index < moves.length; index += 1) {
        const result = validateMoveObject(moves[index], index);
        if (!result.ok) {
            return result;
        }
    }

    return { ok: true, value: moves };
}

function validateGameStartPayload(input) {
    const movesResult = validateMoves(input?.moves);
    if (!movesResult.ok) {
        return movesResult;
    }

    return {
        ok: true,
        value: {
            opponent: normalizeOptionalString(input?.opponent, 80) || "Local",
            moves: movesResult.value || []
        }
    };
}

function validateGameUpdatePayload(gameId, input) {
    if (!Number.isInteger(gameId) || gameId <= 0) {
        return { ok: false, error: "Invalid game id" };
    }

    const movesResult = validateMoves(input?.moves);
    if (!movesResult.ok) {
        return movesResult;
    }

    const result = typeof input?.result === "undefined" ? undefined : normalizeOptionalString(input.result, 80);
    const status = typeof input?.status === "undefined" ? undefined : normalizeOptionalString(input.status, 40);
    const opponent = typeof input?.opponent === "undefined" ? undefined : normalizeOptionalString(input.opponent, 80);

    if (typeof result !== "undefined" && !result) {
        return { ok: false, error: "Result cannot be empty" };
    }

    if (typeof status !== "undefined" && !["in_progress", "finished"].includes(status)) {
        return { ok: false, error: "Invalid status" };
    }

    if (typeof opponent !== "undefined" && !opponent) {
        return { ok: false, error: "Opponent cannot be empty" };
    }

    return {
        ok: true,
        value: {
            gameId,
            moves: movesResult.value,
            result,
            status,
            opponent
        }
    };
}

function validateGameSavePayload(input) {
    const startResult = validateGameStartPayload(input);
    if (!startResult.ok) {
        return startResult;
    }

    const result = normalizeOptionalString(input?.result, 80) || "finished";

    return {
        ok: true,
        value: {
            opponent: startResult.value.opponent,
            result,
            moves: startResult.value.moves
        }
    };
}

module.exports = {
    EMAIL_REGEX,
    PHONE_REGEX,
    SETTINGS_KEYS,
    sanitizeSettings,
    validateGameSavePayload,
    validateGameStartPayload,
    validateGameUpdatePayload,
    validateLoginPayload,
    validateRegisterPayload,
    validateSettingsPayload
};
