const DEFAULT_PLANS = [
    {
        code: "premium-monthly",
        name: "Premium",
        price_label: "$4.99 / month",
        billing_period: "monthly",
        is_active: true,
        description: "Unlock premium puzzles and curated YouTube lesson collections."
    }
];

const DEFAULT_PUZZLES = [
    {
        slug: "queen-net-1",
        title: "Queen Net",
        description: "White to move and finish the game immediately.",
        fen: "6k1/5Q2/6K1/8/8/8/8/8 w - - 0 1",
        solution_moves: ["f7g7"],
        difficulty: "Beginner",
        theme: "Mate in 1",
        is_premium: false
    },
    {
        slug: "corner-squeeze",
        title: "Corner Squeeze",
        description: "Find the precise queen move that ends the game.",
        fen: "7k/6Q1/6K1/8/8/8/8/8 w - - 0 1",
        solution_moves: ["g7f8"],
        difficulty: "Intermediate",
        theme: "Mate in 1",
        is_premium: true
    },
    {
        slug: "rook-finish",
        title: "Rook Finish",
        description: "Use the rook to force checkmate in one move.",
        fen: "6k1/8/6K1/8/8/8/8/6R1 w - - 0 1",
        solution_moves: ["g1g8"],
        difficulty: "Intermediate",
        theme: "Back Rank",
        is_premium: true
    }
];

const DEFAULT_VIDEO_LESSONS = [
    {
        slug: "opening-principles",
        title: "Opening Principles",
        description: "A curated YouTube search for core opening development ideas.",
        youtube_url: "https://www.youtube.com/results?search_query=chess+opening+principles",
        youtube_video_id: null,
        category: "Openings",
        is_premium: false,
        sort_order: 1
    },
    {
        slug: "tactics-patterns",
        title: "Tactics Patterns",
        description: "Curated YouTube results focused on forks, pins, skewers, and tactical motifs.",
        youtube_url: "https://www.youtube.com/results?search_query=chess+tactics+forks+pins+skewers",
        youtube_video_id: null,
        category: "Tactics",
        is_premium: true,
        sort_order: 2
    },
    {
        slug: "endgame-fundamentals",
        title: "Endgame Fundamentals",
        description: "Curated YouTube results for king-and-pawn endgames and practical conversion technique.",
        youtube_url: "https://www.youtube.com/results?search_query=chess+king+and+pawn+endgames",
        youtube_video_id: null,
        category: "Endgames",
        is_premium: true,
        sort_order: 3
    }
];

let premiumSchemaEnsured = false;

async function ensurePremiumSchema(pool) {
    if (premiumSchemaEnsured) return;

    await pool.query(`
        CREATE TABLE IF NOT EXISTS subscription_plans (
            id SERIAL PRIMARY KEY,
            code VARCHAR(60) UNIQUE NOT NULL,
            name VARCHAR(80) NOT NULL,
            price_label VARCHAR(80) NOT NULL,
            billing_period VARCHAR(40) NOT NULL,
            description TEXT,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS user_subscriptions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            plan_id INTEGER NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
            status VARCHAR(40) NOT NULL DEFAULT 'active',
            provider VARCHAR(40) NOT NULL DEFAULT 'manual',
            provider_ref VARCHAR(120),
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS puzzles (
            id SERIAL PRIMARY KEY,
            slug VARCHAR(80) UNIQUE NOT NULL,
            title VARCHAR(120) NOT NULL,
            description TEXT,
            fen TEXT NOT NULL,
            solution_moves JSONB NOT NULL DEFAULT '[]'::jsonb,
            difficulty VARCHAR(40),
            theme VARCHAR(60),
            is_premium BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS video_lessons (
            id SERIAL PRIMARY KEY,
            slug VARCHAR(80) UNIQUE NOT NULL,
            title VARCHAR(140) NOT NULL,
            description TEXT,
            youtube_url TEXT NOT NULL,
            youtube_video_id VARCHAR(40),
            category VARCHAR(60),
            is_premium BOOLEAN DEFAULT TRUE,
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_puzzles_premium ON puzzles(is_premium)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_video_lessons_premium ON video_lessons(is_premium)`);

    for (const plan of DEFAULT_PLANS) {
        await pool.query(
            `INSERT INTO subscription_plans (code, name, price_label, billing_period, description, is_active)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (code) DO UPDATE
             SET name = EXCLUDED.name,
                 price_label = EXCLUDED.price_label,
                 billing_period = EXCLUDED.billing_period,
                 description = EXCLUDED.description,
                 is_active = EXCLUDED.is_active`,
            [plan.code, plan.name, plan.price_label, plan.billing_period, plan.description, plan.is_active]
        );
    }

    for (const puzzle of DEFAULT_PUZZLES) {
        await pool.query(
            `INSERT INTO puzzles (slug, title, description, fen, solution_moves, difficulty, theme, is_premium)
             VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
             ON CONFLICT (slug) DO UPDATE
             SET title = EXCLUDED.title,
                 description = EXCLUDED.description,
                 fen = EXCLUDED.fen,
                 solution_moves = EXCLUDED.solution_moves,
                 difficulty = EXCLUDED.difficulty,
                 theme = EXCLUDED.theme,
                 is_premium = EXCLUDED.is_premium`,
            [
                puzzle.slug,
                puzzle.title,
                puzzle.description,
                puzzle.fen,
                JSON.stringify(puzzle.solution_moves),
                puzzle.difficulty,
                puzzle.theme,
                puzzle.is_premium
            ]
        );
    }

    for (const lesson of DEFAULT_VIDEO_LESSONS) {
        await pool.query(
            `INSERT INTO video_lessons (slug, title, description, youtube_url, youtube_video_id, category, is_premium, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (slug) DO UPDATE
             SET title = EXCLUDED.title,
                 description = EXCLUDED.description,
                 youtube_url = EXCLUDED.youtube_url,
                 youtube_video_id = EXCLUDED.youtube_video_id,
                 category = EXCLUDED.category,
                 is_premium = EXCLUDED.is_premium,
                 sort_order = EXCLUDED.sort_order`,
            [
                lesson.slug,
                lesson.title,
                lesson.description,
                lesson.youtube_url,
                lesson.youtube_video_id,
                lesson.category,
                lesson.is_premium,
                lesson.sort_order
            ]
        );
    }

    premiumSchemaEnsured = true;
}

async function getActiveSubscription(pool, userId) {
    await ensurePremiumSchema(pool);

    const result = await pool.query(
        `SELECT us.*, sp.name AS plan_name, sp.code AS plan_code, sp.price_label, sp.billing_period, sp.description
         FROM user_subscriptions us
         JOIN subscription_plans sp ON sp.id = us.plan_id
         WHERE us.user_id = $1
           AND us.status = 'active'
           AND (us.expires_at IS NULL OR us.expires_at > NOW())
         ORDER BY us.updated_at DESC, us.id DESC
         LIMIT 1`,
        [userId]
    );

    return result.rows[0] || null;
}

function mapSubscriptionStatus(subscriptionRow) {
    if (!subscriptionRow) {
        return {
            isPremium: false,
            status: "inactive",
            planName: null,
            planCode: null,
            priceLabel: null,
            billingPeriod: null,
            description: null,
            startedAt: null,
            expiresAt: null,
            provider: null
        };
    }

    return {
        isPremium: true,
        status: subscriptionRow.status,
        planName: subscriptionRow.plan_name,
        planCode: subscriptionRow.plan_code,
        priceLabel: subscriptionRow.price_label,
        billingPeriod: subscriptionRow.billing_period,
        description: subscriptionRow.description,
        startedAt: subscriptionRow.started_at,
        expiresAt: subscriptionRow.expires_at,
        provider: subscriptionRow.provider
    };
}

module.exports = {
    ensurePremiumSchema,
    getActiveSubscription,
    mapSubscriptionStatus
};
